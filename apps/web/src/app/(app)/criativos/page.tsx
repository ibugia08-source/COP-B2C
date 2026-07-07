import Link from "next/link";
import { and, asc, desc, eq, inArray, lt, not, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { clients, creativeRequests, tasks, users } from "@/db/schema";
import { hasPermission, requirePermission } from "@/lib/auth/guard";
import { CREATIVE_STATUS_META, formatDate, TASK_STATUS_META } from "@/lib/labels";
import {
  Badge,
  EmptyState,
  PageHeader,
  StatCard,
  StatusBadge,
  Table,
  Td,
  Th,
  UserAvatar,
} from "@/components/ui/primitives";
import { CreativeFilters, CreativeFormButton, OBJECTIVE_LABELS, PLATFORM_LABELS, TYPE_LABELS } from "./ui";

type Search = Record<string, string | string[] | undefined>;
const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

export default async function CriativosPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requirePermission("tasks.view");
  const sp = await searchParams;
  const canCreate = hasPermission(session, "tasks.create");
  const now = new Date();
  const visao = str(sp.visao) ?? "fila";

  const filters: SQL[] = [];
  if (str(sp.cliente)) filters.push(eq(creativeRequests.clientId, str(sp.cliente)!));
  if (str(sp.responsavel)) filters.push(eq(creativeRequests.assignedToId, str(sp.responsavel)!));
  if (str(sp.status)) filters.push(eq(creativeRequests.status, str(sp.status) as never));
  if (str(sp.objetivo)) filters.push(eq(creativeRequests.objective, str(sp.objetivo) as never));
  if (str(sp.plataforma)) filters.push(eq(creativeRequests.platform, str(sp.plataforma) as never));
  const OPEN = ["SOLICITADO", "EM_ROTEIRO", "EM_DESIGN", "EM_EDICAO", "AGUARDANDO_APROVACAO"] as const;
  if (str(sp.prazo) === "atrasados") {
    filters.push(lt(creativeRequests.dueDate, now), inArray(creativeRequests.status, [...OPEN]));
  } else if (str(sp.prazo) === "semana") {
    filters.push(lt(creativeRequests.dueDate, new Date(now.getTime() + 7 * 86400_000)));
  }
  if (visao === "atrasados") filters.push(lt(creativeRequests.dueDate, now), inArray(creativeRequests.status, [...OPEN]));
  if (visao === "aprovacao") filters.push(eq(creativeRequests.status, "AGUARDANDO_APROVACAO"));

  const [rows, allUsers, allClients, lateCount, approvalCount, socialTasks] = await Promise.all([
    db.query.creativeRequests.findMany({
      where: filters.length ? and(...filters) : undefined,
      orderBy: [asc(creativeRequests.dueDate), desc(creativeRequests.createdAt)],
      with: { client: true, assignedTo: true, copyResponsible: true },
      limit: 200,
    }),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.isActive, true)),
    db.select({ id: clients.id, name: clients.name }).from(clients).orderBy(asc(clients.name)),
    db.$count(creativeRequests, and(lt(creativeRequests.dueDate, now), inArray(creativeRequests.status, [...OPEN]))),
    db.$count(creativeRequests, eq(creativeRequests.status, "AGUARDANDO_APROVACAO")),
    visao === "social"
      ? db.query.tasks.findMany({
          where: and(eq(tasks.type, "SOCIAL_MEDIA"), not(inArray(tasks.status, ["CANCELADA"]))),
          with: { client: true, assignedTo: true },
          orderBy: [asc(tasks.dueDate)],
        })
      : Promise.resolve([]),
  ]);

  const viewTab = (key: string, label: string, badge?: number) => (
    <Link
      key={key}
      href={key === "fila" ? "/criativos" : `/criativos?visao=${key}`}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
        visao === key ? "bg-emerald-950/70 text-emerald-300" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
      }`}
    >
      {label}
      {badge != null && badge > 0 && <span className="ml-1 text-[10px] text-zinc-500">({badge})</span>}
    </Link>
  );

  return (
    <div>
      <PageHeader
        title="Criativos"
        description="Solicitações de criativos separadas das tarefas gerais — do briefing à publicação."
        actions={canCreate && (
          <CreativeFormButton
            users={allUsers}
            clients={allClients}
            defaultClientId={str(sp.cliente)}
            autoOpen={str(sp.novo) === "1"}
          />
        )}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:max-w-xs">
        <StatCard label="Atrasados" value={lateCount} tone="text-red-400" href="/criativos?visao=atrasados" />
        <StatCard label="Aguardando aprovação" value={approvalCount} tone="text-amber-400" href="/criativos?visao=aprovacao" />
      </div>

      <div className="mb-4 flex flex-wrap gap-1 rounded-lg border border-zinc-800 bg-zinc-900/50 p-1">
        {viewTab("fila", "Fila de criativos")}
        {viewTab("aprovacao", "Aguardando aprovação", approvalCount)}
        {viewTab("atrasados", "Atrasados", lateCount)}
        {viewTab("social", "Social Media")}
      </div>

      {visao === "social" ? (
        <SocialBoard tasks={socialTasks} />
      ) : (
        <>
          <CreativeFilters users={allUsers} clients={allClients} />
          {rows.length === 0 ? (
            <EmptyState icon="🎨" title="Nenhum criativo encontrado" description="Solicite um criativo ou ajuste os filtros." />
          ) : (
            <Table
              minWidth="900px"
              head={
                <>
                  <Th>Criativo</Th>
                  <Th>Cliente</Th>
                  <Th>Tipo</Th>
                  <Th>Objetivo</Th>
                  <Th>Status</Th>
                  <Th>Copy</Th>
                  <Th>Design</Th>
                  <Th>Prazo</Th>
                </>
              }
            >
              {rows.map((c) => {
                const overdue = !!c.dueDate && c.dueDate < now && ["SOLICITADO", "EM_ROTEIRO", "EM_DESIGN", "EM_EDICAO", "AGUARDANDO_APROVACAO"].includes(c.status);
                return (
                  <tr key={c.id} className="hover:bg-zinc-900/60">
                    <Td>
                      <Link href={`/criativos/${c.id}`} className="font-medium text-zinc-100 hover:text-emerald-300">
                        {c.title}
                      </Link>
                      {overdue && <Badge tone="red">atrasado</Badge>}
                    </Td>
                    <Td className="text-zinc-400">{c.client.name}</Td>
                    <Td className="text-zinc-400">{c.creativeType ? TYPE_LABELS[c.creativeType] : "—"}{c.platform ? ` · ${PLATFORM_LABELS[c.platform]}` : ""}</Td>
                    <Td className="text-zinc-400">{c.objective ? OBJECTIVE_LABELS[c.objective] : "—"}</Td>
                    <Td><StatusBadge value={c.status} meta={CREATIVE_STATUS_META} /></Td>
                    <Td>{c.copyResponsible ? <UserAvatar name={c.copyResponsible.name} size="sm" /> : "—"}</Td>
                    <Td>{c.assignedTo ? <UserAvatar name={c.assignedTo.name} size="sm" /> : "—"}</Td>
                    <Td className={overdue ? "text-red-400" : "text-zinc-400"}>{formatDate(c.dueDate)}</Td>
                  </tr>
                );
              })}
            </Table>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Social Media: tarefas SOCIAL_MEDIA agrupadas por status (fluxo de produção)
// ---------------------------------------------------------------------------

function SocialBoard({
  tasks: rows,
}: {
  tasks: { id: string; title: string; status: string; dueDate: Date | null; client: { name: string } | null; assignedTo: { name: string } | null }[];
}) {
  const FLOW = ["BACKLOG", "A_FAZER", "EM_ANDAMENTO", "EM_REVISAO", "CONCLUIDA"] as const;
  if (rows.length === 0) {
    return (
      <EmptyState
        icon="📱"
        title="Nenhuma tarefa de social media"
        description="Crie tarefas do tipo SOCIAL MEDIA no módulo Tarefas ou aplique o template Social Media a um cliente."
      />
    );
  }
  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {FLOW.map((status) => {
        const items = rows.filter((t) => t.status === status);
        return (
          <div key={status} className="w-60 shrink-0 rounded-xl border border-zinc-800 bg-zinc-900/50">
            <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
              <span className="text-xs font-semibold text-zinc-300">{TASK_STATUS_META[status]?.label}</span>
              <span className="rounded-full bg-zinc-800 px-1.5 text-[10px] text-zinc-400">{items.length}</span>
            </div>
            <div className="flex min-h-24 flex-col gap-2 p-2">
              {items.map((t) => (
                <Link key={t.id} href={`/tarefas/${t.id}`} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 transition hover:border-zinc-600">
                  <p className="text-sm text-zinc-100">{t.title}</p>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    {t.client?.name ?? "Interno"} · {t.assignedTo?.name.split(" ")[0] ?? "sem resp."}
                    {t.dueDate ? ` · ${formatDate(t.dueDate)}` : ""}
                  </p>
                </Link>
              ))}
              {items.length === 0 && <p className="py-3 text-center text-[11px] text-zinc-600">vazio</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
