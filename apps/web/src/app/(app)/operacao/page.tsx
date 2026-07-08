import Link from "next/link";
import { and, eq, inArray, isNull, not, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { clients, tasks, users } from "@/db/schema";
import { hasPermission, requirePermission } from "@/lib/auth/guard";
import {
  ADS_META,
  AGENCY_BRAND_META,
  formatDate,
  HEALTH_META,
  PIPELINE_STAGE_META,
} from "@/lib/labels";
import { Button, EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/primitives";
import { OperationKanban, type KanbanClient } from "./kanban";
import { OperationFilters } from "./ui-filters";
import { ModuleConfig } from "../module-config";

type Search = Record<string, string | string[] | undefined>;
const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

export default async function OperacaoPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requirePermission("clients.view");
  const sp = await searchParams;
  const canMove = hasPermission(session, "clients.moveStatus");

  const filters: SQL[] = [];
  if (str(sp.gestor)) filters.push(eq(clients.trafficManager1Id, str(sp.gestor)!));
  if (str(sp.saude)) filters.push(eq(clients.healthStatus, str(sp.saude) as never));
  if (str(sp.nicho)) filters.push(eq(clients.niche, str(sp.nicho)!));
  if (str(sp.empresa)) filters.push(eq(clients.agencyBrand, str(sp.empresa) as never));
  if (str(sp.ads)) filters.push(eq(clients.adsStatus, str(sp.ads) as never));

  const rows = await db.query.clients.findMany({
    where: filters.length ? and(...filters) : undefined,
    with: { trafficManager1: true, strategist: true, operationalProfile: true },
    orderBy: (c, { asc }) => [asc(c.name)],
  });

  // próximo prazo por cliente (menor dueDate de tarefa aberta)
  const openTasks = rows.length
    ? await db
        .select({ clientId: tasks.clientId, dueDate: tasks.dueDate })
        .from(tasks)
        .where(
          and(
            inArray(tasks.clientId, rows.map((r) => r.id)),
            not(inArray(tasks.status, ["CONCLUIDA", "CANCELADA"])),
            not(isNull(tasks.dueDate)),
          ),
        )
    : [];
  const nextDueByClient = new Map<string, Date>();
  for (const t of openTasks) {
    if (!t.clientId || !t.dueDate) continue;
    const current = nextDueByClient.get(t.clientId);
    if (!current || t.dueDate < current) nextDueByClient.set(t.clientId, t.dueDate);
  }

  const kanbanClients: KanbanClient[] = rows.map((c) => {
    const pendencias: string[] = [];
    if (c.status === "ATIVO" && !c.trafficManager1Id && !c.mainResponsibleId) pendencias.push("Sem gestor principal");
    if (c.status === "ATIVO" && !c.operationalProfile?.briefingText) pendencias.push("Sem briefing operacional");
    if (c.adsStatus === "PAUSADO" && c.status === "ATIVO") pendencias.push("Ads pausado");
    const nextDue = nextDueByClient.get(c.id);
    return {
      id: c.id,
      name: c.name,
      niche: c.niche,
      agencyBrand: c.agencyBrand,
      healthStatus: c.healthStatus,
      adsStatus: c.adsStatus,
      pipelineStage: c.pipelineStage,
      gestor1: c.trafficManager1?.name ?? null,
      estrategista: c.strategist?.name ?? null,
      nextDue: nextDue ? nextDue.toISOString() : null,
      pendencias,
    };
  });

  const [allUsers, niches] = await Promise.all([
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.isActive, true)),
    db.selectDistinct({ niche: clients.niche }).from(clients),
  ]);

  const viewList = str(sp.visao) === "lista";

  return (
    <div>
      <PageHeader
        title="Operação"
        description="Pipeline do ciclo de vida do cliente — tarefas internas ficam no módulo Tarefas."
        actions={
          <div className="flex items-center gap-2">
            <ModuleConfig moduleKey="operation" moduleLabel="Operação" />
            <Button variant={viewList ? "secondary" : "primary"} size="sm" href="/operacao">
              Kanban
            </Button>
            <Button variant={viewList ? "primary" : "secondary"} size="sm" href="/operacao?visao=lista">
              Lista
            </Button>
          </div>
        }
      />

      <OperationFilters
        users={allUsers}
        niches={niches.map((n) => n.niche).filter((n): n is string => !!n)}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon="🔄"
          title="Nenhum cliente no pipeline"
          description="Cadastre clientes ou limpe os filtros para vê-los aqui."
        />
      ) : viewList ? (
        <Table
          minWidth="800px"
          head={
            <>
              <Th>Cliente</Th>
              <Th>Etapa</Th>
              <Th>Saúde</Th>
              <Th>Ads</Th>
              <Th>Empresa</Th>
              <Th>Gestor 1</Th>
              <Th>Próximo prazo</Th>
              <Th>Pendências</Th>
            </>
          }
        >
          {kanbanClients.map((c) => (
            <tr key={c.id} className="hover:bg-zinc-900/60">
              <Td>
                <Link href={`/clientes/${c.id}`} className="font-medium text-zinc-100 hover:text-emerald-300">
                  {c.name}
                </Link>
                {c.niche && <p className="text-xs text-zinc-500">{c.niche}</p>}
              </Td>
              <Td><StatusBadge value={c.pipelineStage} meta={PIPELINE_STAGE_META} /></Td>
              <Td><StatusBadge value={c.healthStatus} meta={HEALTH_META} /></Td>
              <Td><StatusBadge value={c.adsStatus} meta={ADS_META} /></Td>
              <Td><StatusBadge value={c.agencyBrand} meta={AGENCY_BRAND_META} /></Td>
              <Td className="text-zinc-400">{c.gestor1 ?? "—"}</Td>
              <Td className={c.nextDue && new Date(c.nextDue) < new Date() ? "text-red-400" : "text-zinc-400"}>
                {c.nextDue ? formatDate(new Date(c.nextDue)) : "—"}
              </Td>
              <Td className="text-xs text-amber-400">{c.pendencias.join(" · ") || "—"}</Td>
            </tr>
          ))}
        </Table>
      ) : (
        <OperationKanban clients={kanbanClients} canMove={canMove} />
      )}
    </div>
  );
}
