import Link from "next/link";
import { and, asc, count, desc, eq, gte, inArray, isNull, like, lt, not, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  ADS_STATUSES,
  AGENCY_BRANDS,
  BUSINESS_MODELS,
  CLIENT_STATUSES,
  HEALTH_STATUSES,
  agencyServices,
  clientMeetings,
  clients,
  tasks,
  users,
} from "@/db/schema";
import { hasPermission, requirePermission } from "@/lib/auth/guard";
import { clientScopeCondition } from "@/lib/auth/ownership";
import { dateOnlyToLocalDate } from "@/lib/date";
import { avatarSrc } from "@/lib/avatar";
import { resolveOptions } from "@/lib/config-options";
import {
  ADS_META,
  AGENCY_BRAND_META,
  BUSINESS_MODEL_LABEL,
  CLIENT_STATUS_META,
  HEALTH_META,
} from "@/lib/labels";
import { Button, EmptyState, PageHeader, StatCard } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { Segmented } from "@/components/ui/toolbar";
import { FilterBar, type FilterDef } from "@/components/ui/filter-bar";
import { CalendarMonth, type CalendarItem } from "@/components/calendar-month";
import { OperationKanban, type KanbanClient, type StageOption } from "./kanban";
import { ClientsList, type ClientRow } from "../clientes/list";
import { ModuleConfig } from "../module-config";
import { BulkBar, SelectionProvider, type BulkMenu } from "@/components/bulk-select";
import { bulkAssignClients, bulkDeleteClients, bulkMoveClients, bulkSetClientsHealth } from "./actions";

type Search = Record<string, string | string[] | undefined>;
const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

const FILTER_KEYS = ["q", "etapa", "servico", "status", "modelo", "saude", "empresa", "nicho", "ads", "gestor", "gestor2", "estrategista"] as const;

// ordenação da lista da carteira (mesmos valores da antiga tela /clientes)
const SORTS: Record<string, SQL> = {
  nome: asc(clients.name),
  entrada: desc(clients.startDate),
  status: asc(clients.status),
  saude: asc(clients.healthStatus),
  recente: desc(clients.updatedAt),
};

export default async function OperacaoPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requirePermission("clients.view");
  const sp = await searchParams;
  const canMove = hasPermission(session, "clients.moveStatus");
  const canCreate = hasPermission(session, "clients.create");
  const canDelete = hasPermission(session, "clients.delete");
  const canUpdate = hasPermission(session, "clients.update");

  // visualização padrão: Geral (tudo) | Operação (só Kanban) | Clientes (só carteira).
  // Definido cedo para carregar só as queries do que vai aparecer.
  const modo = str(sp.modo) ?? "geral";
  const showKanban = modo !== "clientes";
  const showCarteira = modo !== "operacao";

  // --- filtros combinados (as mesmas chaves valem para Kanban e Carteira) -
  const filters: SQL[] = [];
  // escopo de ownership: quem não é OWNER/ADMIN só vê os clientes que gerencia
  const scope = clientScopeCondition(session);
  if (scope) filters.push(scope);
  const qKanban = str(sp.q);
  if (qKanban) {
    const p = `%${qKanban}%`;
    filters.push(or(like(clients.name, p), like(clients.brandName, p), like(clients.legalName, p))!);
  }
  if (str(sp.etapa)) filters.push(eq(clients.pipelineStage, str(sp.etapa) as never));
  if (str(sp.gestor)) filters.push(eq(clients.trafficManager1Id, str(sp.gestor)!));
  if (str(sp.gestor2)) filters.push(eq(clients.trafficManager2Id, str(sp.gestor2)!));
  if (str(sp.estrategista)) filters.push(eq(clients.strategistId, str(sp.estrategista)!));
  if (str(sp.saude)) filters.push(eq(clients.healthStatus, str(sp.saude) as never));
  if (str(sp.nicho)) filters.push(eq(clients.niche, str(sp.nicho)!));
  if (str(sp.empresa)) filters.push(eq(clients.agencyBrand, str(sp.empresa) as never));
  if (str(sp.ads)) filters.push(eq(clients.adsStatus, str(sp.ads) as never));

  // --- carteira: filtros + batch (independentes do Kanban) ------------------
  // Definido e DISPARADO aqui para rodar concorrente com a onda do Kanban abaixo
  // (antes rodava em série, depois do Kanban + openTasks). Consumido lá embaixo.
  // Chaves compartilhadas (saude, empresa, nicho, ads, estrategista) filtram os dois.
  const listFilters: SQL[] = [];
  if (scope) listFilters.push(scope);
  const q = str(sp.q);
  if (q) {
    const pattern = `%${q}%`;
    listFilters.push(
      or(like(clients.name, pattern), like(clients.brandName, pattern), like(clients.legalName, pattern))!,
    );
  }
  const listEq = [
    [str(sp.status), clients.status],
    [str(sp.empresa), clients.agencyBrand],
    [str(sp.modelo), clients.businessModel],
    [str(sp.saude), clients.healthStatus],
    [str(sp.ads), clients.adsStatus],
    [str(sp.nicho), clients.niche],
    [str(sp.estrategista), clients.strategistId],
    [str(sp.gestor), clients.trafficManager1Id],
    [str(sp.gestor2), clients.trafficManager2Id],
  ] as const;
  for (const [value, column] of listEq) {
    if (value) listFilters.push(eq(column as unknown as typeof clients.name, value));
  }
  const listOrderBy = SORTS[str(sp.ordenar) ?? "recente"] ?? SORTS.recente;

  // Contagens da carteira em UMA query (count(*) filter), escopo de ownership no WHERE.
  const zeroTotals = { total: 0, ativos: 0, observacao: 0, criticos: 0, perdidos: 0, adsPausado: 0 };
  const countIf = (c: SQL) => sql<number>`count(*) filter (where ${c})`.mapWith(Number);
  const carteiraBatch = Promise.all([
    showCarteira
      ? db.query.clients.findMany({
          where: listFilters.length ? and(...listFilters) : undefined,
          orderBy: [listOrderBy],
          with: { strategist: true, trafficManager1: true },
        })
      : Promise.resolve([]),
    showCarteira ? resolveOptions("clients", "niche", { activeOnly: true }) : Promise.resolve([]),
    showCarteira
      ? db
          .select({
            total: count(),
            ativos: countIf(eq(clients.status, "ATIVO")),
            observacao: countIf(eq(clients.healthStatus, "OBSERVACAO")),
            criticos: countIf(eq(clients.healthStatus, "CRITICO")),
            perdidos: countIf(eq(clients.status, "PERDIDO")),
            adsPausado: countIf(eq(clients.adsStatus, "PAUSADO")),
          })
          .from(clients)
          .where(scope)
      : Promise.resolve([zeroTotals]),
  ]);

  // allUsers é usado pelos filtros das duas seções; o resto do Kanban só quando showKanban
  const [allRows, allUsers, niches, servicesRows, stageOptionsAll] = await Promise.all([
    showKanban
      ? db.query.clients.findMany({
          where: filters.length ? and(...filters) : undefined,
          with: { trafficManager1: true, strategist: true, operationalProfile: true },
          // ordem manual do Kanban (boardOrder); cliente novo entra no fim da coluna
          orderBy: (c, { asc: a }) => [a(c.boardOrder), a(c.createdAt)],
        })
      : Promise.resolve([]),
    db.select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl }).from(users).where(eq(users.isActive, true)),
    showKanban ? db.selectDistinct({ niche: clients.niche }).from(clients).where(scope) : Promise.resolve([]),
    showKanban
      ? db
          .select({ name: agencyServices.name })
          .from(agencyServices)
          .where(eq(agencyServices.isActive, true))
          .orderBy(asc(agencyServices.order), asc(agencyServices.name))
      : Promise.resolve([]),
    showKanban ? resolveOptions("operation", "pipeline") : Promise.resolve([]),
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
  const nextDueByClient = new Map<string, string>();
  for (const t of openTasks) {
    if (!t.clientId || !t.dueDate) continue;
    const current = nextDueByClient.get(t.clientId);
    if (!current || t.dueDate < current) nextDueByClient.set(t.clientId, t.dueDate);
  }

  const kanbanClients: KanbanClient[] = rows.map((c) => {
    const pendencias: string[] = [];
    if (c.status === "ATIVO" && !c.trafficManager1Id) pendencias.push("Sem gestor principal");
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
      gestor1Avatar: avatarSrc(c.trafficManager1?.id, c.trafficManager1?.avatarUrl) ?? null,
      estrategista: c.strategist?.name ?? null,
      nextDue: nextDue ?? null,
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
  const pad2 = (n: number) => String(n).padStart(2, "0");
  // Limites do mês como data-only ('YYYY-MM-DD') para filtrar tasks.dueDate (date).
  const monthStartStr = `${monthStart.getFullYear()}-${pad2(monthStart.getMonth() + 1)}-01`;
  const monthEndStr = `${monthEnd.getFullYear()}-${pad2(monthEnd.getMonth() + 1)}-01`;

  let calendarItems: CalendarItem[] = [];
  if (visao === "calendario" && rows.length) {
    const clientIds = rows.map((r) => r.id);
    const [monthTasks, monthMeetings] = await Promise.all([
      db.query.tasks.findMany({
        where: and(
          inArray(tasks.clientId, clientIds),
          gte(tasks.dueDate, monthStartStr),
          lt(tasks.dueDate, monthEndStr),
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
        .filter((t): t is typeof t & { dueDate: string } => !!t.dueDate)
        .map<CalendarItem>((t) => ({
          kind: "task",
          id: t.id,
          title: `${t.client?.name ?? ""} — ${t.title}`,
          href: `/tarefas/${t.id}`,
          date: dateOnlyToLocalDate(t.dueDate),
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

  // --- carteira de clientes: lista + métricas (unificada nesta tela) --------
  // A definição e o disparo do batch estão lá em cima (carteiraBatch), para rodar
  // concorrente com a onda do Kanban. Aqui só consumimos o resultado.
  const [listClients, clientNiches, totalsRows] = await carteiraBatch;
  const { total, ativos, observacao, criticos, perdidos, adsPausado } = totalsRows[0] ?? zeroTotals;

  const listRows: ClientRow[] = listClients.map((c) => ({
    id: c.id,
    name: c.name,
    city: c.city,
    state: c.state,
    agencyBrand: c.agencyBrand,
    niche: c.niche,
    businessModel: c.businessModel,
    status: c.status,
    healthStatus: c.healthStatus,
    adsStatus: c.adsStatus,
    gestor1Id: c.trafficManager1Id,
    gestor1Name: c.trafficManager1?.name ?? null,
    gestor1Avatar: avatarSrc(c.trafficManager1?.id, c.trafficManager1?.avatarUrl) ?? null,
    startDate: c.startDate ?? null,
  }));
  const listOptions = {
    brands: AGENCY_BRANDS.map((v) => ({ value: v, label: AGENCY_BRAND_META[v]?.label ?? v })),
    models: BUSINESS_MODELS.map((v) => ({ value: v, label: BUSINESS_MODEL_LABEL[v] ?? v })),
    niches: clientNiches.map((n) => ({ value: n.value, label: n.label })),
    statuses: CLIENT_STATUSES.filter((v) => v !== "PERDIDO").map((v) => ({ value: v, label: CLIENT_STATUS_META[v]?.label ?? v })),
    healths: HEALTH_STATUSES.filter((v) => v !== "CRITICO").map((v) => ({ value: v, label: HEALTH_META[v]?.label ?? v })),
    adsStatuses: ADS_STATUSES.map((v) => ({ value: v, label: ADS_META[v]?.label ?? v })),
    users: allUsers.map((u) => ({ value: u.id, label: u.name })),
  };

  // --- filtro unificado: uma barra só; os controles se adaptam ao modo -----
  const userOpts = allUsers.map((u) => ({ value: u.id, label: u.name }));
  const nicheOpts = showCarteira
    ? clientNiches.map((n) => ({ value: n.value, label: n.label }))
    : niches.map((n) => n.niche).filter((n): n is string => !!n).map((n) => ({ value: n, label: n }));
  const filterConfig: FilterDef[] = [
    { key: "q", kind: "search", placeholder: "Buscar cliente...", width: "w-48" },
    { key: "empresa", kind: "select", label: "Empresa", options: AGENCY_BRANDS.map((v) => ({ value: v, label: AGENCY_BRAND_META[v]?.label ?? v })) },
    { key: "nicho", kind: "select", label: "Nicho", options: nicheOpts },
    { key: "saude", kind: "select", label: "Saúde", options: HEALTH_STATUSES.map((v) => ({ value: v, label: HEALTH_META[v]?.label ?? v })) },
    { key: "ads", kind: "select", label: "Ads", options: ADS_STATUSES.map((v) => ({ value: v, label: ADS_META[v]?.label ?? v })) },
    { key: "gestor", kind: "select", label: "Gestor", options: userOpts },
    { key: "gestor2", kind: "select", label: "Gestor 2", options: userOpts },
    { key: "estrategista", kind: "select", label: "Estrategista", options: userOpts },
  ];
  if (showKanban) {
    filterConfig.push({ key: "etapa", kind: "select", label: "Etapa", options: stageActive.map((o) => ({ value: o.value, label: o.label })) });
    filterConfig.push({ key: "servico", kind: "select", label: "Serviço", options: servicesRows.map((s) => ({ value: s.name, label: s.name })) });
  }
  if (showCarteira) {
    filterConfig.push({ key: "status", kind: "select", label: "Status", options: CLIENT_STATUSES.map((v) => ({ value: v, label: CLIENT_STATUS_META[v]?.label ?? v })) });
    filterConfig.push({ key: "modelo", kind: "select", label: "Modelo", options: BUSINESS_MODELS.map((v) => ({ value: v, label: BUSINESS_MODEL_LABEL[v] ?? v })) });
    filterConfig.push({
      key: "ordenar",
      kind: "select",
      label: "Ordenar",
      emptyLabel: "Recentes (padrão)",
      options: [
        { value: "nome", label: "Nome" },
        { value: "entrada", label: "Data de entrada" },
        { value: "status", label: "Status" },
        { value: "saude", label: "Saúde" },
      ],
    });
  }
  // href de um StatCard: mantém o modo atual e aplica um filtro limpo
  const carteiraHref = (patch: Record<string, string>) => {
    const p = new URLSearchParams();
    if (modo !== "geral") p.set("modo", modo);
    for (const [k, v] of Object.entries(patch)) p.set(k, v);
    const s = p.toString();
    return s ? `/operacao?${s}` : "/operacao";
  };

  return (
    <div>
      <PageHeader
        title="Operação"
        description="CRM operacional — pipeline do ciclo de vida do cliente. Demandas internas ficam em Tarefas."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              ariaLabel="Modo de visualização"
              active={modo}
              items={[
                { value: "geral", label: "Geral", href: buildHref({ modo: null }) },
                { value: "operacao", label: "Operação", icon: "operation", href: buildHref({ modo: "operacao" }) },
                { value: "clientes", label: "Clientes", icon: "clients", href: buildHref({ modo: "clientes" }) },
              ]}
            />
            {showKanban && (
              <Segmented
                size="sm"
                ariaLabel="Visão do pipeline"
                active={visao}
                items={[
                  { value: "kanban", label: "Kanban", href: buildHref({ visao: null }) },
                  { value: "calendario", label: "Calendário", href: buildHref({ visao: "calendario" }) },
                ]}
              />
            )}
            {showKanban && <ModuleConfig moduleKey="operation" moduleLabel="Operação" buttonLabel="Colunas" />}
            <Link
              href={buildHref({ filtros: showFilters && activeFilterCount === 0 ? null : "1" })}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                activeFilterCount > 0 || showFilters
                  ? "border-emerald-700 bg-emerald-950/40 text-emerald-300"
                  : "border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
              }`}
            >
              <Icon name="search" /> Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </Link>
            {canCreate && <Button href="/clientes/novo">+ Novo cliente</Button>}
          </div>
        }
      />

      {showFilters && (
        <FilterBar
          filters={filterConfig}
          preserve={["modo", "visao", "mes", "filtros"]}
          resultCount={modo === "clientes" ? listRows.length : modo === "operacao" ? kanbanClients.length : undefined}
        />
      )}

      {showKanban && (
        <>
          <SelectionProvider>
          {visao === "calendario" ? (
            <CalendarMonth year={calYear} month={calMonth} buildHref={buildHref} items={calendarItems} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon="operation"
              title="Nenhum cliente no pipeline"
              description="Cadastre clientes ou limpe os filtros para vê-los aqui."
            />
          ) : (
            <OperationKanban
              clients={kanbanClients}
              columns={kanbanColumns}
              canMove={canMove}
              canCreate={canCreate}
              canDelete={canDelete}
              users={allUsers.map((u) => ({ id: u.id, name: u.name, avatar: avatarSrc(u.id, u.avatarUrl) ?? null }))}
            />
          )}
            <BulkBar entityLabel="clientes" menus={bulkMenus} deleteAction={canDelete ? bulkDeleteClients : undefined} />
          </SelectionProvider>
        </>
      )}

      {/* ---- Carteira de clientes: métricas + lista (antiga tela /clientes) ---- */}
      {showCarteira && (
      <section className={showKanban ? "mt-8 border-t border-zinc-800 pt-6" : "mt-2"}>
        <div className="mb-4 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Carteira de clientes</h2>
            <p className="text-sm text-zinc-500">Todos os clientes da agência, com métricas e edição rápida.</p>
          </div>
          <ModuleConfig moduleKey="clients" moduleLabel="Clientes" />
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Total de clientes" value={total} href={carteiraHref({})} />
          <StatCard label="Ativos" value={ativos} tone="text-emerald-400" href={carteiraHref({ status: "ATIVO" })} />
          <StatCard label="Em observação" value={observacao} tone="text-amber-400" href={carteiraHref({ saude: "OBSERVACAO" })} />
          <StatCard label="Críticos" value={criticos} tone="text-red-400" href={carteiraHref({ saude: "CRITICO" })} />
          <StatCard label="Perdidos" value={perdidos} tone="text-zinc-400" href={carteiraHref({ status: "PERDIDO" })} />
          <StatCard label="Ads pausado" value={adsPausado} tone="text-amber-400" href={carteiraHref({ ads: "PAUSADO" })} />
        </div>

        {listRows.length === 0 ? (
          <EmptyState
            icon="clients"
            title="Nenhum cliente na carteira"
            description="Cadastre clientes ou limpe os filtros da carteira para vê-los aqui."
          />
        ) : (
          <ClientsList rows={listRows} options={listOptions} canUpdate={canUpdate} canDelete={canDelete} bulkRaised={showKanban} />
        )}
      </section>
      )}
    </div>
  );
}
