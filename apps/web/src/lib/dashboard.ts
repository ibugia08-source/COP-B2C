import { and, eq, inArray, isNull, not, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { clients, digitalAssets, goals, tasks, users } from "@/db/schema";
import type { MetricKey } from "@/lib/dashboard-metrics";

export type DashboardFilters = {
  empresa?: string;
  gestor?: string;
  nicho?: string;
};

const OPEN_TASK = ["CONCLUIDA", "CANCELADA"] as const;
const OPEN_GOAL = ["PLANEJADA", "EM_EXECUCAO", "FINALIZANDO"] as const;

export type DashboardData = {
  metrics: Record<MetricKey, number>;
  clients: { byStatus: { label: string; value: number }[]; byGestor: { label: string; value: number }[] };
  tasks: { byAssignee: { label: string; value: number }[]; byStatus: { label: string; value: number }[] };
  assets: { byStatus: { label: string; value: number }[] };
  churnSeries: { label: string; value: number }[];
  workload: {
    name: string;
    open: number;
    overdue: number;
    urgent: number;
    clients: number;
    creatives: number;
    assets: number;
  }[];
};

export async function getDashboardData(
  filters: DashboardFilters,
  userId: string,
  canGlobal = false,
): Promise<DashboardData> {
  const now = new Date();
  const in7days = new Date(now.getTime() + 7 * 86400_000);

  const clientWhere: SQL[] = [];
  if (filters.empresa) clientWhere.push(eq(clients.agencyBrand, filters.empresa as never));
  if (filters.gestor) clientWhere.push(eq(clients.trafficManager1Id, filters.gestor));
  if (filters.nicho) clientWhere.push(eq(clients.niche, filters.nicho));

  const allClients = await db.query.clients.findMany({
    where: clientWhere.length ? and(...clientWhere) : undefined,
    with: { trafficManager1: true, operationalProfile: true },
  });
  const clientIds = allClients.map((c) => c.id);
  const filtered = !!(filters.empresa || filters.gestor || filters.nicho);
  const scopedTasks = filtered && clientIds.length ? inArray(tasks.clientId, clientIds) : undefined;

  const [openTasks, allUsers, assets, myOpenTasks, pendingSignups, openGoals] = await Promise.all([
    db.query.tasks.findMany({
      where: and(not(inArray(tasks.status, [...OPEN_TASK])), isNull(tasks.parentTaskId), scopedTasks),
      with: { assignedTo: true },
    }),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.isActive, true)),
    db.query.digitalAssets.findMany({
      where: and(
        isNull(digitalAssets.archivedAt),
        filtered && clientIds.length ? inArray(digitalAssets.clientId, clientIds) : undefined,
      ),
    }),
    // métricas pessoais ignoram o filtro de clientes do dashboard
    db.query.tasks.findMany({
      where: and(
        eq(tasks.assignedToId, userId),
        not(inArray(tasks.status, [...OPEN_TASK])),
        isNull(tasks.parentTaskId),
      ),
    }),
    db.$count(users, eq(users.status, "PENDENTE")),
    db.query.goals.findMany({ where: inArray(goals.status, [...OPEN_GOAL]) }),
  ]);

  // Churn: perdidos nos últimos 6 meses (mês a mês)
  const churnSeries: { label: string; value: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    churnSeries.push({
      label: new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(start),
      value: allClients.filter((c) => c.churnDate && c.churnDate >= start && c.churnDate < end).length,
    });
  }

  const overdueTasks = openTasks.filter((t) => t.dueDate && t.dueDate < now);
  const creativeTasks = openTasks.filter((t) => t.type === "CRIATIVO");

  // Alertas operacionais: clientes com pendências que exigem ação
  const operationalAlerts = allClients.filter((c) => {
    if (c.status === "ATIVO" && !c.trafficManager1Id) return true;
    if (c.status === "ATIVO" && !c.operationalProfile?.briefingText) return true;
    if (c.adsStatus === "PAUSADO" && c.status === "ATIVO") return true;
    return false;
  }).length;

  // Carga por colaborador (nomes + volume de todos): visão gerencial —
  // só para quem tem dashboard.view_global.
  const workload = !canGlobal
    ? []
    : allUsers
        .map((u) => {
          const userTasks = openTasks.filter((t) => t.assignedToId === u.id);
          return {
            name: u.name,
            open: userTasks.length,
            overdue: userTasks.filter((t) => t.dueDate && t.dueDate < now).length,
            urgent: userTasks.filter((t) => t.priority === "URGENTE").length,
            clients: allClients.filter((c) => c.trafficManager1Id === u.id).length,
            creatives: creativeTasks.filter((t) => t.assignedToId === u.id).length,
            assets: assets.filter((a) => a.assignedToId === u.id || a.ownerUserId === u.id).length,
          };
        })
        .filter((w) => w.open || w.clients || w.creatives || w.assets);

  const metrics: Record<MetricKey, number> = {
    clientes_ativos: allClients.filter((c) => c.status === "ATIVO").length,
    clientes_criticos: allClients.filter((c) => c.healthStatus === "CRITICO").length,
    clientes_observacao: allClients.filter((c) => c.healthStatus === "OBSERVACAO").length,
    clientes_ads_pausado: allClients.filter((c) => c.adsStatus === "PAUSADO").length,
    tarefas_atrasadas: overdueTasks.length,
    tarefas_sem_responsavel: openTasks.filter((t) => !t.assignedToId).length,
    minhas_tarefas_pendentes: myOpenTasks.length,
    minhas_tarefas_atrasadas: myOpenTasks.filter((t) => t.dueDate && t.dueDate < now).length,
    solicitacoes_pendentes: pendingSignups,
    ativos_total: assets.length,
    ativos_bloqueados: assets.filter((a) => a.status === "BLOQUEADA").length,
    ativos_prontos: assets.filter((a) => a.status === "PRONTA_PARA_USO").length,
    ativos_precisa_documentos: assets.filter((a) => a.status === "PRECISA_DE_DOCUMENTOS").length,
    ativos_esquentando: assets.filter((a) => a.status === "SENDO_ESQUENTADA").length,
    ativos_revisao_pendente: assets.filter((a) => a.nextReviewAt && a.nextReviewAt < now).length,
    metas_andamento: openGoals.filter((g) => g.status === "EM_EXECUCAO").length,
    metas_prazo: openGoals.filter((g) => g.periodEnd && g.periodEnd <= in7days).length,
    alertas_operacionais: operationalAlerts,
  };

  return {
    metrics,
    clients: {
      byStatus: groupCount(allClients.map((c) => c.status)),
      // gráficos por nome (gestor/responsável) = visão gerencial
      byGestor: canGlobal
        ? groupCount(allClients.map((c) => c.trafficManager1?.name ?? "Sem gestor"))
        : [],
    },
    tasks: {
      byAssignee: canGlobal
        ? groupCount(openTasks.map((t) => t.assignedTo?.name ?? "Sem responsável"))
        : [],
      byStatus: groupCount(openTasks.map((t) => t.status)),
    },
    assets: { byStatus: groupCount(assets.map((a) => a.status)) },
    churnSeries: canGlobal ? churnSeries : [],
    workload,
  };
}

function groupCount(values: string[]): { label: string; value: number }[] {
  const map = new Map<string, number>();
  for (const v of values) map.set(v, (map.get(v) ?? 0) + 1);
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}
