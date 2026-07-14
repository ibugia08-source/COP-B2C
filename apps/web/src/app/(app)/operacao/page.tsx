import Link from "next/link";
import { and, asc, eq, gte, inArray, isNull, lt, not, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { agencyServices, clientMeetings, clients, tasks, users } from "@/db/schema";
import { hasPermission, requirePermission } from "@/lib/auth/guard";
import { clientScopeCondition } from "@/lib/auth/ownership";
import { resolveOptions } from "@/lib/config-options";
import { HEALTH_META } from "@/lib/labels";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { CalendarMonth, type CalendarItem } from "@/components/calendar-month";
import { OperationKanban, type KanbanClient, type StageOption } from "./kanban";
import { OperationFilters } from "./ui-filters";
import { ModuleConfig } from "../module-config";
import { BulkBar, SelectionProvider, type BulkMenu } from "@/components/bulk-select";
import { bulkAssignClients, bulkDeleteClients, bulkMoveClients, bulkSetClientsHealth } from "./actions";

type Search = Record<string, string | string[] | undefined>;
const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

const FILTER_KEYS = ["etapa", "cliente", "responsavel", "gestor", "estrategista", "saude", "empresa", "nicho", "ads", "servico"] as const;

export default async function OperacaoPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requirePermission("clients.view");
  const sp = await searchParams;
  const canMove = hasPermission(session, "clients.moveStatus");
  const canCreate = hasPermission(session, "clients.create");
  const canDelete = hasPermission(session, "clients.delete");
  const canUpdate = hasPermission(session, "clients.update");

  // --- filtros combinados -------------------------------------------------
  const filters: SQL[] = [];
  // escopo de ownership: quem não é OWNER/ADMIN só vê os clientes que gerencia
  const scope = clientScopeCondition(session);
  if (scope) filters.push(scope);
  if (str(sp.etapa)) filters.push(eq(clients.pipelineStage, str(sp.etapa) as never));
  if (str(sp.cliente)) filters.push(eq(clients.id, str(sp.cliente)!));
  if (str(sp.responsavel)) filters.push(eq(clients.mainResponsibleId, str(sp.responsavel)!));
  if (str(sp.gestor)) filters.push(eq(clients.trafficManager1Id, str(sp.gestor)!));
  if (str(sp.estrategista)) filters.push(eq(clients.strategistId, str(sp.estrategista)!));
  if (str(sp.saude)) filters.push(eq(clients.healthStatus, str(sp.saude) as never));
  if (str(sp.nicho)) filters.push(eq(clients.niche, str(sp.nicho)!));
  if (str(sp.empresa)) filters.push(eq(clients.agencyBrand, str(sp.empresa) as never));
  if (str(sp.ads)) filters.push(eq(clients.adsStatus, str(sp.ads) as never));

  const [allRows, allUsers, niches, servicesRows, stageOptionsAll, clientOptions] = await Promise.all([
    db.query.clients.findMany({
      where: filters.length ? and(...filters) : undefined,
      with: { trafficManager1: true, strategist: true, operationalProfile: true },
      orderBy: (c, { asc: a }) => [a(c.name)],
    }),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.isActive, true)),
    db.selectDistinct({ niche: clients.niche }).from(clients),
    db
      .select({ name: agencyServices.name })
      .from(agencyServices)
      .where(eq(agencyServices.isActive, true))
      .orderBy(asc(agencyServices.order), asc(agencyServices.name)),
    resolveOptions("operation", "pipeline"),
    db.select({ id: clients.id, name: clients.name }).from(clients).orderBy(asc(clients.name)),
  ]);

  // serviço utilizado: filtra sobre o perfil operacional (lista de serviços do cliente)
  const servico = str(sp.servico);
  const rows = servico
    ? allRows.filter((c) => (c.operationalProfile?.platforms ?? []).includes(servico))
    : allRows;

  // colunas ativas do Kanban (built-in + colunas custom)
  const stageActive = stageOptionsAll.filter((o) => o.isActive);
  const kanbanColumns: StageOption[] = stageActive.map((o) => ({ value: o.value, label: o.label, color: o.color }));

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

  // --- visões e URLs --------------------------------------------------------
  const visao = str(sp.visao) ?? "kanban";
  const buildHref = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && v) next.set(k, v);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    const s = next.toString();
    return s ? `/operacao?${s}` : "/operacao";
  };
  const activeFilterCount = FILTER_KEYS.filter((k) => str(sp[k])).length;
  const showFilters = str(sp.filtros) === "1" || activeFilterCount > 0;

  // --- calendário: demandas operacionais com prazo + reuniões ---------------
  const now = new Date();
  const mesParam = str(sp.mes);
  const [calYear, calMonth] = /^\d{4}-\d{2}$/.test(mesParam ?? "")
    ? [Number(mesParam!.slice(0, 4)), Number(mesParam!.slice(5, 7)) - 1]
    : [now.getFullYear(), now.getMonth()];
  const monthStart = new Date(calYear, calMonth, 1);
  const monthEnd = new Date(calYear, calMonth + 1, 1);

  let calendarItems: CalendarItem[] = [];
  if (visao === "calendario" && rows.length) {
    const clientIds = rows.map((r) => r.id);
    const [monthTasks, monthMeetings] = await Promise.all([
      db.query.tasks.findMany({
        where: and(
          inArray(tasks.clientId, clientIds),
          gte(tasks.dueDate, monthStart),
          lt(tasks.dueDate, monthEnd),
        ),
        with: { client: true },
      }),
      db.query.clientMeetings.findMany({
        where: and(
          inArray(clientMeetings.clientId, clientIds),
          gte(clientMeetings.meetingDate, monthStart),
          lt(clientMeetings.meetingDate, monthEnd),
        ),
        with: { client: true },
      }),
    ]);
    calendarItems = [
      ...monthTasks
        .filter((t): t is typeof t & { dueDate: Date } => !!t.dueDate)
        .map<CalendarItem>((t) => ({
          kind: "task",
          id: t.id,
          title: `${t.client?.name ?? ""} — ${t.title}`,
          href: `/tarefas/${t.id}`,
          date: t.dueDate,
          done: t.status === "CONCLUIDA",
        })),
      ...monthMeetings.map<CalendarItem>((m) => ({
        kind: "meeting",
        id: m.id,
        title: `${m.client?.name ?? "Cliente"} — ${m.title}`,
        href: `/clientes/${m.clientId}`,
        date: m.meetingDate,
        showTime: true,
      })),
    ];
  }

  const bulkMenus: BulkMenu[] = [];
  if (canMove) {
    bulkMenus.push({
      label: "Mover etapa…",
      options: stageActive
        .filter((o) => o.value !== "CLIENTE_CRITICO" && o.value !== "CLIENTE_PERDIDO")
        .map((o) => ({ value: o.value, label: o.label })),
      run: bulkMoveClients,
    });
  }
  if (canUpdate) {
    bulkMenus.push({
      label: "Gestor…",
      options: [{ value: "", label: "— Sem gestor —" }, ...allUsers.map((u) => ({ value: u.id, label: u.name }))],
      run: bulkAssignClients,
    });
    bulkMenus.push({
      label: "Saúde…",
      options: Object.entries(HEALTH_META).filter(([v]) => v !== "CRITICO").map(([v, m]) => ({ value: v, label: m.label })),
      run: bulkSetClientsHealth,
    });
  }

  const viewBtn = (key: string, label: string) => (
    <Link
      key={key}
      href={buildHref({ visao: key === "kanban" ? null : key })}
      className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
        visao === key ? "bg-emerald-950/70 text-emerald-300" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div>
      <PageHeader
        title="Operação"
        description="CRM operacional — pipeline do ciclo de vida do cliente. Demandas internas ficam em Tarefas."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ModuleConfig moduleKey="operation" moduleLabel="Operação" buttonLabel="Colunas" />
            <Link
              href={buildHref({ filtros: showFilters && activeFilterCount === 0 ? null : "1" })}
              className={`rounded-lg border px-3 py-2 text-sm transition ${
                activeFilterCount > 0
                  ? "border-emerald-700 text-emerald-300"
                  : "border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white"
              }`}
            >
              Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </Link>
            <span className="flex items-center gap-0.5 rounded-lg border border-zinc-800 bg-zinc-900/60 p-0.5">
              {viewBtn("kanban", "Kanban")}
              {viewBtn("calendario", "Calendário")}
            </span>
            {canCreate && (
              <Link
                href="/clientes/novo"
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-500"
              >
                + Novo cliente
              </Link>
            )}
          </div>
        }
      />

      {showFilters && (
        <OperationFilters
          users={allUsers}
          clients={clientOptions}
          niches={niches.map((n) => n.niche).filter((n): n is string => !!n)}
          services={servicesRows.map((s) => s.name)}
          stageOptions={stageActive.map((o) => ({ value: o.value, label: o.label }))}
        />
      )}

      <SelectionProvider>
      {visao === "calendario" ? (
        <CalendarMonth year={calYear} month={calMonth} buildHref={buildHref} items={calendarItems} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="🔄"
          title="Nenhum cliente no pipeline"
          description="Cadastre clientes ou limpe os filtros para vê-los aqui."
        />
      ) : (
        <OperationKanban clients={kanbanClients} columns={kanbanColumns} canMove={canMove} canCreate={canCreate} canDelete={canDelete} />
      )}
        <BulkBar entityLabel="clientes" menus={bulkMenus} deleteAction={canDelete ? bulkDeleteClients : undefined} />
      </SelectionProvider>
    </div>
  );
}
