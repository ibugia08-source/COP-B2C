import { and, eq, gte, inArray, isNull, not, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  clients,
  creativeRequests,
  digitalAssetAuditLogs,
  digitalAssets,
  tasks,
  users,
} from "@/db/schema";

export type DashboardFilters = {
  empresa?: string;
  gestor?: string;
  nicho?: string;
};

const OPEN_TASK = ["CONCLUIDA", "CANCELADA"] as const;
const OPEN_CREATIVE = ["SOLICITADO", "EM_ROTEIRO", "EM_DESIGN", "EM_EDICAO", "AGUARDANDO_APROVACAO"];

export async function getDashboardData(filters: DashboardFilters) {
  const now = new Date();

  const clientWhere: SQL[] = [];
  if (filters.empresa) clientWhere.push(eq(clients.agencyBrand, filters.empresa as never));
  if (filters.gestor) clientWhere.push(eq(clients.trafficManager1Id, filters.gestor));
  if (filters.nicho) clientWhere.push(eq(clients.niche, filters.nicho));

  const allClients = await db.query.clients.findMany({
    where: clientWhere.length ? and(...clientWhere) : undefined,
    with: { trafficManager1: true },
  });
  const clientIds = allClients.map((c) => c.id);
  const filtered = !!(filters.empresa || filters.gestor || filters.nicho);

  const [openTasks, allUsers, creatives, assets, recentReveals] = await Promise.all([
    db.query.tasks.findMany({
      where: and(
        not(inArray(tasks.status, [...OPEN_TASK])),
        isNull(tasks.parentTaskId),
        filtered && clientIds.length ? inArray(tasks.clientId, clientIds) : undefined,
      ),
      with: { assignedTo: true },
    }),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.isActive, true)),
    db.query.creativeRequests.findMany({
      where: filtered && clientIds.length ? inArray(creativeRequests.clientId, clientIds) : undefined,
      with: { assignedTo: true, copyResponsible: true },
    }),
    db.query.digitalAssets.findMany({
      where: and(
        isNull(digitalAssets.archivedAt),
        filtered && clientIds.length ? inArray(digitalAssets.clientId, clientIds) : undefined,
      ),
    }),
    // segredos revelados nos últimos 7 dias
    db.$count(
      digitalAssetAuditLogs,
      and(
        inArray(digitalAssetAuditLogs.action, ["SECRET_REVEALED", "SECRET_COPIED"]),
        gte(digitalAssetAuditLogs.createdAt, new Date(now.getTime() - 7 * 86400_000)),
      ),
    ),
  ]);

  // Churn operacional: clientes perdidos nos últimos 6 meses (mês a mês)
  const churnSeries: { label: string; value: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    churnSeries.push({
      label: new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(start),
      value: allClients.filter((c) => c.churnDate && c.churnDate >= start && c.churnDate < end).length,
    });
  }

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const overdueTasks = openTasks.filter((t) => t.dueDate && t.dueDate < now);
  const openCreatives = creatives.filter((c) => OPEN_CREATIVE.includes(c.status));

  const workload = allUsers
    .map((u) => {
      const userTasks = openTasks.filter((t) => t.assignedToId === u.id);
      return {
        name: u.name,
        open: userTasks.length,
        overdue: userTasks.filter((t) => t.dueDate && t.dueDate < now).length,
        urgent: userTasks.filter((t) => t.priority === "URGENTE").length,
        clients: allClients.filter((c) => c.trafficManager1Id === u.id || c.mainResponsibleId === u.id).length,
        creatives: openCreatives.filter((c) => c.assignedToId === u.id || c.copyResponsibleId === u.id).length,
        assets: assets.filter((a) => a.assignedToId === u.id || a.ownerUserId === u.id).length,
      };
    })
    .filter((w) => w.open || w.clients || w.creatives || w.assets);

  return {
    clients: {
      total: allClients.length,
      ativos: allClients.filter((c) => c.status === "ATIVO").length,
      criticos: allClients.filter((c) => c.healthStatus === "CRITICO").length,
      observacao: allClients.filter((c) => c.healthStatus === "OBSERVACAO").length,
      perdidosNoMes: allClients.filter((c) => c.churnDate && c.churnDate >= monthStart).length,
      adsPausado: allClients.filter((c) => c.adsStatus === "PAUSADO").length,
      byStatus: groupCount(allClients.map((c) => c.status)),
      byNiche: groupCount(allClients.map((c) => c.niche ?? "Sem nicho")),
      byGestor: groupCount(allClients.map((c) => c.trafficManager1?.name ?? "Sem gestor")),
    },
    tasks: {
      overdue: overdueTasks.length,
      unassigned: openTasks.filter((t) => !t.assignedToId).length,
      byAssignee: groupCount(openTasks.map((t) => t.assignedTo?.name ?? "Sem responsável")),
      byStatus: groupCount(openTasks.map((t) => t.status)),
    },
    creatives: {
      waitingApproval: creatives.filter((c) => c.status === "AGUARDANDO_APROVACAO").length,
      overdue: openCreatives.filter((c) => c.dueDate && c.dueDate < now).length,
    },
    assets: {
      total: assets.length,
      bloqueados: assets.filter((a) => a.status === "BLOQUEADA").length,
      prontos: assets.filter((a) => a.status === "PRONTA_PARA_USO").length,
      precisaDocumentos: assets.filter((a) => a.status === "PRECISA_DE_DOCUMENTOS").length,
      esquentando: assets.filter((a) => a.status === "SENDO_ESQUENTADA").length,
      revisaoPendente: assets.filter((a) => a.nextReviewAt && a.nextReviewAt < now).length,
      segredosRevelados7d: recentReveals,
      byStatus: groupCount(assets.map((a) => a.status)),
    },
    churnSeries,
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
