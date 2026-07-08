import Link from "next/link";
import { and, asc, eq, isNull, like, lt, not, inArray, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { clients, tasks, users } from "@/db/schema";
import { hasPermission, requirePermission } from "@/lib/auth/guard";
import { formatDate, PRIORITY_META, TASK_STATUS_META, TASK_TYPE_META } from "@/lib/labels";
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
import { TaskCreateButton, TaskFilters, TasksKanban, type KanbanTask } from "./ui";

type Search = Record<string, string | string[] | undefined>;
const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

const DAY = 24 * 60 * 60 * 1000;

export default async function TarefasPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requirePermission("tasks.view");
  const sp = await searchParams;
  const canUpdate = hasPermission(session, "tasks.update");
  const canCreate = hasPermission(session, "tasks.create");

  const filters: SQL[] = [isNull(tasks.parentTaskId)];
  if (str(sp.cliente)) filters.push(eq(tasks.clientId, str(sp.cliente)!));
  const resp = str(sp.responsavel);
  if (resp === "__none__") filters.push(isNull(tasks.assignedToId));
  else if (resp) filters.push(eq(tasks.assignedToId, resp));
  if (str(sp.tipo)) filters.push(eq(tasks.type, str(sp.tipo) as never));
  const status = str(sp.status);
  if (status === "__abertas__") filters.push(not(inArray(tasks.status, ["CONCLUIDA", "CANCELADA"])));
  else if (status) filters.push(eq(tasks.status, status as never));
  if (str(sp.prioridade)) filters.push(eq(tasks.priority, str(sp.prioridade) as never));
  if (str(sp.tag)) filters.push(like(tasks.tags, `%"${str(sp.tag)}"%`));

  const now = new Date();
  const prazo = str(sp.prazo);
  if (prazo === "atrasadas") {
    filters.push(lt(tasks.dueDate, now), not(inArray(tasks.status, ["CONCLUIDA", "CANCELADA"])));
  } else if (prazo === "hoje") {
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    const end = new Date(now); end.setHours(23, 59, 59, 999);
    filters.push(not(isNull(tasks.dueDate)));
    filters.push(lt(tasks.dueDate, end));
    filters.push(not(lt(tasks.dueDate, start)));
  } else if (prazo === "semana") {
    filters.push(not(isNull(tasks.dueDate)));
    filters.push(lt(tasks.dueDate, new Date(now.getTime() + 7 * DAY)));
  } else if (prazo === "sem") {
    filters.push(isNull(tasks.dueDate));
  }

  // Visões rápidas
  const visao = str(sp.visao) ?? "lista";
  if (visao === "minhas") filters.push(eq(tasks.assignedToId, session.userId), not(inArray(tasks.status, ["CONCLUIDA", "CANCELADA"])));
  if (visao === "atrasadas") filters.push(lt(tasks.dueDate, now), not(inArray(tasks.status, ["CONCLUIDA", "CANCELADA"])));
  if (visao === "sem-responsavel") filters.push(isNull(tasks.assignedToId), not(inArray(tasks.status, ["CONCLUIDA", "CANCELADA"])));

  const [rows, allUsers, allClients, counts] = await Promise.all([
    db.query.tasks.findMany({
      where: and(...filters),
      orderBy: [asc(tasks.dueDate)],
      with: { client: true, assignedTo: true, subtasks: true },
      limit: 300,
    }),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.isActive, true)),
    db.select({ id: clients.id, name: clients.name }).from(clients).orderBy(asc(clients.name)),
    Promise.all([
      db.$count(tasks, and(eq(tasks.assignedToId, session.userId), not(inArray(tasks.status, ["CONCLUIDA", "CANCELADA"])))),
      db.$count(tasks, and(lt(tasks.dueDate, now), not(inArray(tasks.status, ["CONCLUIDA", "CANCELADA"])))),
      db.$count(tasks, and(isNull(tasks.assignedToId), not(inArray(tasks.status, ["CONCLUIDA", "CANCELADA"])), isNull(tasks.parentTaskId))),
    ]),
  ]);
  const [minhas, atrasadas, semResponsavel] = counts;

  const tags = Array.from(new Set(rows.flatMap((t) => t.tags))).sort();
  const kanbanItems: KanbanTask[] = rows.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    type: t.type,
    clientName: t.client?.name ?? null,
    assignee: t.assignedTo?.name ?? null,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    overdue: !!t.dueDate && !t.completedAt && t.dueDate < now && t.status !== "CONCLUIDA" && t.status !== "CANCELADA",
  }));

  const viewTab = (key: string, label: string, badge?: number) => (
    <Link
      key={key}
      href={key === "lista" ? "/tarefas" : `/tarefas?visao=${key}`}
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
        title="Tarefas"
        description="Central de tarefas da operação — diárias, semanais, projetos e rotinas."
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/tarefas/templates"
              className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white"
            >
              📋 Templates
            </Link>
            {canCreate && (
              <TaskCreateButton
                users={allUsers}
                clients={allClients}
                defaultClientId={str(sp.cliente)}
                defaultType={str(sp.tipo)}
                digitalAssetId={str(sp.ativo)}
                autoOpen={str(sp.nova) === "1"}
              />
            )}
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-3 gap-3 sm:max-w-md">
        <StatCard label="Minhas abertas" value={minhas} tone="text-sky-400" href="/tarefas?visao=minhas" />
        <StatCard label="Atrasadas" value={atrasadas} tone="text-red-400" href="/tarefas?visao=atrasadas" />
        <StatCard label="Sem responsável" value={semResponsavel} tone="text-amber-400" href="/tarefas?visao=sem-responsavel" />
      </div>

      <div className="mb-4 flex flex-wrap gap-1 rounded-lg border border-zinc-800 bg-zinc-900/50 p-1">
        {viewTab("lista", "Lista")}
        {viewTab("kanban", "Kanban")}
        {viewTab("calendario", "Calendário")}
        {viewTab("minhas", "Minhas tarefas", minhas)}
        {viewTab("atrasadas", "Atrasadas", atrasadas)}
        {viewTab("sem-responsavel", "Sem responsável", semResponsavel)}
      </div>

      <TaskFilters users={allUsers} clients={allClients} tags={tags} />

      {rows.length === 0 ? (
        <EmptyState
          icon="☑"
          title="Nenhuma tarefa encontrada"
          description="Crie uma tarefa ou ajuste os filtros."
        />
      ) : visao === "kanban" ? (
        <TasksKanban items={kanbanItems} canUpdate={canUpdate} />
      ) : visao === "calendario" ? (
        <CalendarView tasks={rows.filter((t) => t.dueDate)} />
      ) : (
        <Table
          minWidth="860px"
          head={
            <>
              <Th>Tarefa</Th>
              <Th>Tipo</Th>
              <Th>Status</Th>
              <Th>Prioridade</Th>
              <Th>Cliente</Th>
              <Th>Responsável</Th>
              <Th>Vencimento</Th>
            </>
          }
        >
          {rows.map((t) => {
            const overdue = !!t.dueDate && !t.completedAt && t.dueDate < now && !["CONCLUIDA", "CANCELADA"].includes(t.status);
            return (
              <tr key={t.id} className="hover:bg-zinc-900/60">
                <Td>
                  <Link href={`/tarefas/${t.id}`} className="font-medium text-zinc-100 hover:text-emerald-300">
                    {t.title}
                  </Link>
                  <span className="ml-2 space-x-1">
                    {t.subtasks.length > 0 && <Badge tone="zinc">{t.subtasks.filter((s) => s.status === "CONCLUIDA").length}/{t.subtasks.length} sub</Badge>}
                    {overdue && <Badge tone="red">vencida</Badge>}
                    {!t.assignedToId && <Badge tone="amber">sem responsável</Badge>}
                  </span>
                </Td>
                <Td><StatusBadge value={t.type} meta={TASK_TYPE_META} /></Td>
                <Td><StatusBadge value={t.status} meta={TASK_STATUS_META} /></Td>
                <Td><StatusBadge value={t.priority} meta={PRIORITY_META} /></Td>
                <Td className="text-zinc-400">
                  {t.client ? (
                    <Link href={`/clientes/${t.client.id}`} className="hover:text-emerald-300">{t.client.name}</Link>
                  ) : "—"}
                </Td>
                <Td>
                  {t.assignedTo ? (
                    <span className="flex items-center gap-1.5">
                      <UserAvatar name={t.assignedTo.name} size="sm" />
                      <span className="text-xs text-zinc-400">{t.assignedTo.name.split(" ")[0]}</span>
                    </span>
                  ) : <span className="text-amber-500">—</span>}
                </Td>
                <Td className={overdue ? "text-red-400" : "text-zinc-400"}>{formatDate(t.dueDate)}</Td>
              </tr>
            );
          })}
        </Table>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calendário simples (mês atual)
// ---------------------------------------------------------------------------

function CalendarView({ tasks: rows }: { tasks: { id: string; title: string; dueDate: Date | null; status: string }[] }) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = firstDay.getDay();

  const byDay = new Map<number, typeof rows>();
  for (const t of rows) {
    if (!t.dueDate || t.dueDate.getMonth() !== month || t.dueDate.getFullYear() !== year) continue;
    const d = t.dueDate.getDate();
    byDay.set(d, [...(byDay.get(d) ?? []), t]);
  }

  const cells: (number | null)[] = [
    ...Array.from({ length: startWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div>
      <p className="mb-2 text-sm font-semibold capitalize text-zinc-300">
        {new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(now)}
      </p>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-zinc-500">
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
          <div key={d} className="py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => (
          <div
            key={i}
            className={`min-h-20 rounded-lg border p-1.5 ${
              day === now.getDate() ? "border-emerald-700 bg-emerald-950/20" : "border-zinc-800 bg-zinc-900/40"
            } ${day == null ? "opacity-30" : ""}`}
          >
            {day && (
              <>
                <p className="text-right text-[10px] text-zinc-500">{day}</p>
                <div className="space-y-0.5">
                  {(byDay.get(day) ?? []).slice(0, 3).map((t) => (
                    <Link
                      key={t.id}
                      href={`/tarefas/${t.id}`}
                      className={`block truncate rounded px-1 py-0.5 text-[10px] ${
                        t.status === "CONCLUIDA" ? "bg-zinc-800 text-zinc-500 line-through" : "bg-sky-950/60 text-sky-300 hover:bg-sky-900/60"
                      }`}
                    >
                      {t.title}
                    </Link>
                  ))}
                  {(byDay.get(day)?.length ?? 0) > 3 && (
                    <p className="text-[10px] text-zinc-500">+{byDay.get(day)!.length - 3}</p>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      {rows.length === 0 && (
        <div className="mt-4">
          <EmptyState icon="🗓️" title="Nenhuma tarefa com prazo neste mês" />
        </div>
      )}
    </div>
  );
}
