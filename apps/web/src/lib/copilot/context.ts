import { and, desc, eq, gte, inArray, isNotNull, lt, not, or } from "drizzle-orm";
import { db } from "@/db";
import {
  activityLogs,
  clientMeetings,
  clients,
  digitalAssets,
  documents,
  goals,
  tasks,
  users,
} from "@/db/schema";
import { addDaysDateOnly, todayDateOnly } from "@/lib/date";

/**
 * Contexto operacional diário do gestor — montado APENAS com dados internos da
 * plataforma aos quais o usuário já tem acesso (clientes atribuídos a ele,
 * tarefas dele, ativos dos clientes dele). É a base do Co-piloto.
 */

const DAY = 86_400_000;
const CLOSED_TASK = ["CONCLUIDA", "CANCELADA"] as const;

export type ContextClient = {
  id: string;
  name: string;
  healthStatus: string;
  status: string;
  pipelineStage: string;
  niche: string | null;
  servicesUsed: string[];
};
export type ContextTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  clientId: string | null;
  clientName: string | null;
  createdByName: string | null;
};
export type ContextAsset = { id: string; title: string; clientId: string | null; clientName: string | null };
export type ContextMeeting = { id: string; title: string; meetingDate: Date; clientId: string; clientName: string };
export type ContextGoalAlert = { id: string; title: string; periodEnd: string; overdue: boolean };
export type ContextActivity = { id: string; action: string; entityId: string | null; userName: string | null; createdAt: Date };

export type ContextDocument = { id: string; title: string; clientId: string | null; clientName: string | null };

export type ManagerDailyContext = {
  userId: string;
  date: Date;
  assignedClients: ContextClient[];
  criticalClients: ContextClient[];
  observationClients: ContextClient[];
  overdueTasks: ContextTask[];
  todayTasks: ContextTask[];
  pendingRequests: ContextTask[]; // solicitações abertas feitas por outros para o gestor
  waitingTeamTasks: ContextTask[]; // tarefas paradas aguardando resposta da equipe
  blockedDigitalAssets: ContextAsset[];
  assetsNeedingDocs: ContextAsset[];
  upcomingMeetings: ContextMeeting[];
  goalsAlerts: ContextGoalAlert[];
  recentDocuments: ContextDocument[];
  recentActivity: ContextActivity[];
  suggestedPriorities: string[];
};

export async function buildManagerDailyContext(userId: string): Promise<ManagerDailyContext> {
  const now = new Date();
  // Datas-only (dueDate/periodEnd) comparadas como string 'YYYY-MM-DD'.
  const todayStr = todayDateOnly();

  // Carteira: clientes em que o usuário é gestor, estrategista ou responsável
  const clientRows = await db.query.clients.findMany({
    where: and(
      or(
        eq(clients.trafficManager1Id, userId),
        eq(clients.trafficManager2Id, userId),
        eq(clients.strategistId, userId),
      ),
      not(eq(clients.status, "PERDIDO")),
    ),
    columns: { id: true, name: true, healthStatus: true, status: true, pipelineStage: true, niche: true },
    with: { operationalProfile: { columns: { platforms: true } } },
    orderBy: (c, { asc }) => [asc(c.name)],
  });
  const assignedClients: ContextClient[] = clientRows.map((c) => ({
    id: c.id,
    name: c.name,
    healthStatus: c.healthStatus,
    status: c.status,
    pipelineStage: c.pipelineStage,
    niche: c.niche,
    servicesUsed: c.operationalProfile?.platforms ?? [],
  }));
  const clientIds = assignedClients.map((c) => c.id);
  const clientName = new Map(assignedClients.map((c) => [c.id, c.name]));

  const criticalClients = assignedClients.filter((c) => c.healthStatus === "CRITICO");
  const observationClients = assignedClients.filter((c) => c.healthStatus === "OBSERVACAO");

  // Tarefas do gestor
  const myOpenTasks = await db.query.tasks.findMany({
    where: and(eq(tasks.assignedToId, userId), not(inArray(tasks.status, [...CLOSED_TASK]))),
    with: { client: { columns: { name: true } }, createdBy: { columns: { name: true } } },
    orderBy: [desc(tasks.priority)],
    limit: 200,
  });
  const toTask = (t: (typeof myOpenTasks)[number]): ContextTask => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    dueDate: t.dueDate,
    clientId: t.clientId,
    clientName: t.client?.name ?? null,
    createdByName: t.createdBy?.name ?? null,
  });

  const overdueTasks = myOpenTasks.filter((t) => t.dueDate && t.dueDate < todayStr).map(toTask);
  const todayTasks = myOpenTasks
    .filter((t) => t.dueDate === todayStr)
    .map(toTask);
  const pendingRequests = myOpenTasks
    .filter((t) => t.createdById && t.createdById !== userId && (t.status === "A_FAZER" || t.status === "BACKLOG"))
    .map(toTask);
  const waitingTeamTasks = myOpenTasks
    .filter((t) => t.status === "AGUARDANDO_EQUIPE" || t.status === "AGUARDANDO_CLIENTE")
    .map(toTask);

  // Ativos com problema relevantes (do gestor ou de clientes da carteira):
  // bloqueados e precisando de documentos
  const problemAssetRows = await db.query.digitalAssets.findMany({
    where: and(
      inArray(digitalAssets.status, ["BLOQUEADA", "PRECISA_DE_DOCUMENTOS"]),
      clientIds.length
        ? or(eq(digitalAssets.assignedToId, userId), inArray(digitalAssets.clientId, clientIds))
        : eq(digitalAssets.assignedToId, userId),
    ),
    columns: { id: true, title: true, clientId: true, status: true, archivedAt: true },
  });
  const toAsset = (a: (typeof problemAssetRows)[number]): ContextAsset => ({
    id: a.id,
    title: a.title,
    clientId: a.clientId,
    clientName: a.clientId ? (clientName.get(a.clientId) ?? null) : null,
  });
  const activeProblemAssets = problemAssetRows.filter((a) => !a.archivedAt);
  const blockedDigitalAssets = activeProblemAssets.filter((a) => a.status === "BLOQUEADA").map(toAsset);
  const assetsNeedingDocs = activeProblemAssets.filter((a) => a.status === "PRECISA_DE_DOCUMENTOS").map(toAsset);

  // Reuniões próximas (7 dias) — do gestor ou da carteira
  const meetingRows = await db.query.clientMeetings.findMany({
    where: and(
      gte(clientMeetings.meetingDate, now),
      lt(clientMeetings.meetingDate, new Date(now.getTime() + 7 * DAY)),
      eq(clientMeetings.status, "AGENDADA"),
      clientIds.length
        ? or(eq(clientMeetings.responsibleId, userId), inArray(clientMeetings.clientId, clientIds))
        : eq(clientMeetings.responsibleId, userId),
    ),
    with: { client: { columns: { name: true } } },
    orderBy: (m, { asc }) => [asc(m.meetingDate)],
  });
  const upcomingMeetings: ContextMeeting[] = meetingRows.map((m) => ({
    id: m.id,
    title: m.title,
    meetingDate: m.meetingDate,
    clientId: m.clientId,
    clientName: m.client?.name ?? "Cliente",
  }));

  // Metas do gestor com prazo próximo/vencido
  const goalRows = await db.query.goals.findMany({
    where: and(
      eq(goals.ownerId, userId),
      isNotNull(goals.periodEnd),
      not(inArray(goals.status, ["CONCLUIDA", "CANCELADA", "FINALIZADA"])),
    ),
    columns: { id: true, title: true, periodEnd: true },
  });
  const goalsAlerts: ContextGoalAlert[] = goalRows
    .filter((g) => g.periodEnd && g.periodEnd <= addDaysDateOnly(todayStr, 3))
    .map((g) => ({ id: g.id, title: g.title, periodEnd: g.periodEnd!, overdue: g.periodEnd! < todayStr }));

  // Documentos vinculados aos clientes da carteira (mais recentes)
  const recentDocuments: ContextDocument[] = clientIds.length
    ? (
        await db.query.documents.findMany({
          where: and(inArray(documents.clientId, clientIds), eq(documents.isArchived, false)),
          columns: { id: true, title: true, clientId: true },
          orderBy: [desc(documents.updatedAt)],
          limit: 5,
        })
      ).map((d) => ({
        id: d.id,
        title: d.title,
        clientId: d.clientId,
        clientName: d.clientId ? (clientName.get(d.clientId) ?? null) : null,
      }))
    : [];

  // Atividade recente na carteira
  const recentActivity: ContextActivity[] = clientIds.length
    ? (
        await db
          .select({
            id: activityLogs.id,
            action: activityLogs.action,
            entityId: activityLogs.entityId,
            userName: users.name,
            createdAt: activityLogs.createdAt,
          })
          .from(activityLogs)
          .leftJoin(users, eq(activityLogs.userId, users.id))
          .where(and(eq(activityLogs.entityType, "client"), inArray(activityLogs.entityId, clientIds)))
          .orderBy(desc(activityLogs.createdAt))
          .limit(10)
      ).map((r) => ({ ...r, entityId: r.entityId ?? null, userName: r.userName ?? null }))
    : [];

  // Prioridades sugeridas (texto objetivo, sem chain-of-thought)
  const suggestedPriorities: string[] = [];
  for (const c of criticalClients.slice(0, 3)) {
    suggestedPriorities.push(`Revisar o cliente crítico ${c.name} e atualizar o plano de ação.`);
  }
  const urgentOverdue = overdueTasks.filter((t) => t.priority === "URGENTE" || t.priority === "ALTA");
  for (const t of urgentOverdue.slice(0, 3)) {
    suggestedPriorities.push(`Resolver a tarefa atrasada "${t.title}"${t.clientName ? ` (${t.clientName})` : ""}.`);
  }
  for (const a of blockedDigitalAssets.slice(0, 2)) {
    suggestedPriorities.push(`Encaminhar o desbloqueio do ativo "${a.title}"${a.clientName ? ` (${a.clientName})` : ""}.`);
  }
  if (upcomingMeetings[0]) {
    const m = upcomingMeetings[0];
    suggestedPriorities.push(`Preparar a reunião "${m.title}" com ${m.clientName}.`);
  }
  for (const g of goalsAlerts.slice(0, 1)) {
    suggestedPriorities.push(`${g.overdue ? "Meta vencida" : "Meta perto do prazo"}: ${g.title}.`);
  }

  return {
    userId,
    date: now,
    assignedClients,
    criticalClients,
    observationClients,
    overdueTasks,
    todayTasks,
    pendingRequests,
    waitingTeamTasks,
    blockedDigitalAssets,
    assetsNeedingDocs,
    upcomingMeetings,
    goalsAlerts,
    recentDocuments,
    recentActivity,
    suggestedPriorities: suggestedPriorities.slice(0, 6),
  };
}
