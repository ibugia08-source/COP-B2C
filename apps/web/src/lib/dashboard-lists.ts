import { and, asc, eq, inArray, isNotNull, isNull, lt, lte, ne, not, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { clients, digitalAssets, goals, tasks, users } from "@/db/schema";
import { addDaysDateOnly, todayDateOnly } from "@/lib/date";
import type { DashboardFilters } from "@/lib/dashboard";
import type { MetricKey } from "@/lib/dashboard-metrics";

/**
 * Detalhamento por métrica do dashboard: a MESMA métrica que o card conta,
 * aqui devolvida como LISTA (para o modal de detalhamento).
 *
 * Os critérios espelham `getDashboardData` (lib/dashboard.ts) — se um mudar, o
 * outro precisa mudar junto, senão o número do card diverge da lista do modal.
 */
export type MetricItem = {
  id: string;
  title: string;
  subtitle?: string | null;
  /** informação à direita (prazo, status…) */
  meta?: string | null;
  /** true = destaca em vermelho (atrasado/crítico) */
  alert?: boolean;
  /** link para o registro completo */
  href: string;
};

/** Teto de itens no modal — evita payload gigante; a UI avisa quando trunca. */
export const METRIC_ITEMS_LIMIT = 100;

/** Cliente que saiu da base não entra nas métricas de saúde/ads. */
const inBase = ne(clients.status, "PERDIDO");

const OPEN_TASK = ["CONCLUIDA", "CANCELADA"] as const;
const OPEN_GOAL = ["PLANEJADA", "EM_EXECUCAO", "FINALIZANDO"] as const;

/** Mesmos filtros de cliente aplicados pelo dashboard (empresa/gestor/nicho). */
function clientConditions(filters: DashboardFilters): SQL[] {
  const w: SQL[] = [];
  if (filters.empresa) w.push(eq(clients.agencyBrand, filters.empresa as never));
  if (filters.gestor) w.push(eq(clients.trafficManager1Id, filters.gestor));
  if (filters.nicho) w.push(eq(clients.niche, filters.nicho));
  return w;
}

const isFiltered = (f: DashboardFilters) => !!(f.empresa || f.gestor || f.nicho);

/** IDs dos clientes no escopo do filtro (só quando há filtro ativo). */
async function filteredClientIds(filters: DashboardFilters): Promise<string[] | null> {
  if (!isFiltered(filters)) return null;
  const rows = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(...clientConditions(filters)));
  return rows.map((r) => r.id);
}

async function listClients(filters: DashboardFilters, extra: SQL): Promise<MetricItem[]> {
  const rows = await db
    .select({
      id: clients.id,
      name: clients.name,
      niche: clients.niche,
      status: clients.status,
    })
    .from(clients)
    .where(and(...clientConditions(filters), extra))
    .orderBy(asc(clients.name))
    .limit(METRIC_ITEMS_LIMIT);
  return rows.map((c) => ({
    id: c.id,
    title: c.name,
    subtitle: c.niche,
    meta: c.status,
    href: `/clientes/${c.id}`,
  }));
}

async function listTasks(
  filters: DashboardFilters,
  extra: SQL[],
  opts: { onlyMine?: string } = {},
): Promise<MetricItem[]> {
  const ids = await filteredClientIds(filters);
  // métricas pessoais ignoram o filtro de clientes (igual ao dashboard)
  const scoped = !opts.onlyMine && ids ? [inArray(tasks.clientId, ids)] : [];
  const where = and(
    not(inArray(tasks.status, [...OPEN_TASK])),
    isNull(tasks.parentTaskId),
    ...(opts.onlyMine ? [eq(tasks.assignedToId, opts.onlyMine)] : []),
    ...scoped,
    ...extra,
  );
  const rows = await db.query.tasks.findMany({
    where,
    columns: { id: true, title: true, dueDate: true, status: true },
    with: { client: { columns: { name: true } } },
    orderBy: [asc(tasks.dueDate), asc(tasks.createdAt)],
    limit: METRIC_ITEMS_LIMIT,
  });
  const today = todayDateOnly();
  return rows.map((t) => ({
    id: t.id,
    title: t.title,
    subtitle: t.client?.name ?? null,
    meta: t.dueDate,
    alert: !!t.dueDate && t.dueDate < today,
    href: `/tarefas/${t.id}`,
  }));
}

async function listAssets(filters: DashboardFilters, extra: SQL[]): Promise<MetricItem[]> {
  const ids = await filteredClientIds(filters);
  const rows = await db.query.digitalAssets.findMany({
    where: and(
      isNull(digitalAssets.archivedAt),
      ...(ids ? [inArray(digitalAssets.clientId, ids)] : []),
      ...extra,
    ),
    columns: { id: true, title: true, status: true, nextReviewAt: true },
    with: { client: { columns: { name: true } } },
    orderBy: [asc(digitalAssets.title)],
    limit: METRIC_ITEMS_LIMIT,
  });
  return rows.map((a) => ({
    id: a.id,
    title: a.title,
    subtitle: a.client?.name ?? "Interno da agência",
    meta: a.nextReviewAt,
    href: `/ativos/${a.id}`,
  }));
}

async function listGoals(extra: SQL[]): Promise<MetricItem[]> {
  const rows = await db.query.goals.findMany({
    where: and(inArray(goals.status, [...OPEN_GOAL]), ...extra),
    columns: { id: true, title: true, status: true, periodEnd: true },
    orderBy: [asc(goals.periodEnd)],
    limit: METRIC_ITEMS_LIMIT,
  });
  const today = todayDateOnly();
  return rows.map((g) => ({
    id: g.id,
    title: g.title,
    subtitle: g.status,
    meta: g.periodEnd,
    alert: !!g.periodEnd && g.periodEnd < today,
    href: `/metas`,
  }));
}

/**
 * Devolve os itens que compõem uma métrica. A permissão JÁ deve ter sido
 * checada por quem chama (ver `fetchMetricItems` em dashboard-actions.ts).
 */
export async function getMetricItems(
  key: MetricKey,
  filters: DashboardFilters,
  userId: string,
): Promise<MetricItem[]> {
  const today = todayDateOnly();

  switch (key) {
    // ---------------- clientes ----------------
    case "clientes_ativos":
      return listClients(filters, eq(clients.status, "ATIVO"));
    // saúde/ads: só quem ainda está na base (PERDIDO já saiu) — mesmo critério
    // da contagem em lib/dashboard.ts (`inBase`)
    case "clientes_criticos":
      return listClients(filters, and(inBase, eq(clients.healthStatus, "CRITICO"))!);
    case "clientes_observacao":
      return listClients(filters, and(inBase, eq(clients.healthStatus, "OBSERVACAO"))!);
    case "clientes_ads_pausado":
      return listClients(filters, and(inBase, eq(clients.adsStatus, "PAUSADO"))!);

    // ---------------- tarefas ----------------
    case "tarefas_atrasadas":
      return listTasks(filters, [lt(tasks.dueDate, today)]);
    case "tarefas_sem_responsavel":
      return listTasks(filters, [isNull(tasks.assignedToId)]);
    case "minhas_tarefas_pendentes":
      return listTasks(filters, [], { onlyMine: userId });
    case "minhas_tarefas_atrasadas":
      return listTasks(filters, [lt(tasks.dueDate, today)], { onlyMine: userId });

    // ---------------- ativos digitais ----------------
    case "ativos_total":
      return listAssets(filters, []);
    case "ativos_bloqueados":
      return listAssets(filters, [eq(digitalAssets.status, "BLOQUEADA")]);
    case "ativos_prontos":
      return listAssets(filters, [eq(digitalAssets.status, "PRONTA_PARA_USO")]);
    case "ativos_precisa_documentos":
      return listAssets(filters, [eq(digitalAssets.status, "PRECISA_DE_DOCUMENTOS")]);
    case "ativos_esquentando":
      return listAssets(filters, [eq(digitalAssets.status, "SENDO_ESQUENTADA")]);
    case "ativos_revisao_pendente":
      return listAssets(filters, [lt(digitalAssets.nextReviewAt, today)]);

    // ---------------- metas ----------------
    case "metas_andamento":
      return listGoals([eq(goals.status, "EM_EXECUCAO")]);
    case "metas_prazo":
      return listGoals([isNotNull(goals.periodEnd), lte(goals.periodEnd, addDaysDateOnly(today, 7))]);

    // ---------------- alertas / equipe ----------------
    case "solicitacoes_pendentes": {
      const rows = await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(eq(users.status, "PENDENTE"))
        .orderBy(asc(users.name))
        .limit(METRIC_ITEMS_LIMIT);
      return rows.map((u) => ({
        id: u.id,
        title: u.name,
        subtitle: u.email,
        meta: "aguardando aprovação",
        alert: true,
        href: `/equipe`,
      }));
    }
    case "alertas_operacionais": {
      // mesmas 3 regras de pendência do dashboard (lib/dashboard.ts)
      const rows = await db.query.clients.findMany({
        where: and(...clientConditions(filters)),
        columns: { id: true, name: true, status: true, adsStatus: true, trafficManager1Id: true },
        with: { operationalProfile: { columns: { briefingText: true } } },
        orderBy: [asc(clients.name)],
      });
      return rows
        .flatMap((c) => {
          const motivos: string[] = [];
          if (c.status === "ATIVO" && !c.trafficManager1Id) motivos.push("sem gestor principal");
          if (c.status === "ATIVO" && !c.operationalProfile?.briefingText) motivos.push("sem briefing");
          if (c.adsStatus === "PAUSADO" && c.status === "ATIVO") motivos.push("ads pausado");
          if (!motivos.length) return [];
          return [{
            id: c.id,
            title: c.name,
            subtitle: motivos.join(" · "),
            meta: null,
            alert: true,
            href: `/clientes/${c.id}`,
          }];
        })
        .slice(0, METRIC_ITEMS_LIMIT);
    }
  }
}
