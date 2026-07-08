"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  clientMeetings,
  clientOperationalProfiles,
  clients,
  HEALTH_STATUSES,
  PIPELINE_STAGES,
  type AdsStatus,
  type HealthStatus,
  type PipelineStage,
} from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { checkPermission } from "@/lib/auth/guard";
import { emitEvent } from "@/lib/automations/engine";
import { isValidOptionValue } from "@/lib/config-options";
import { clientFormSchema, operationalProfileSchema } from "@/lib/validations/client";

export type ActionState = { error?: string; success?: string };

function parseClientForm(formData: FormData) {
  return clientFormSchema.safeParse({
    name: formData.get("name"),
    legalName: formData.get("legalName") ?? undefined,
    brandName: formData.get("brandName") ?? undefined,
    agencyBrand: formData.get("agencyBrand"),
    businessModel: formData.get("businessModel"),
    niche: formData.get("niche") ?? undefined,
    city: formData.get("city") ?? undefined,
    state: formData.get("state") ?? undefined,
    instagramUrl: formData.get("instagramUrl") ?? undefined,
    websiteUrl: formData.get("websiteUrl") ?? undefined,
    decisionMakerName: formData.get("decisionMakerName") ?? undefined,
    decisionMakerPhone: formData.get("decisionMakerPhone") ?? undefined,
    decisionMakerEmail: formData.get("decisionMakerEmail") ?? undefined,
    status: formData.get("status"),
    healthStatus: formData.get("healthStatus"),
    adsStatus: formData.get("adsStatus"),
    strategistId: formData.get("strategistId") ?? undefined,
    trafficManager1Id: formData.get("trafficManager1Id") ?? undefined,
    trafficManager2Id: formData.get("trafficManager2Id") ?? undefined,
    mainResponsibleId: formData.get("mainResponsibleId") ?? undefined,
    startDate: formData.get("startDate") ?? undefined,
    notes: formData.get("notes") ?? undefined,
  });
}

export async function createClient(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await checkPermission("clients.create");
  if (!auth.ok) return { error: auth.error };

  const parsed = parseClientForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const d = parsed.data;

  if (d.healthStatus === "CRITICO" && !d.notes) {
    return { error: "Cliente com saúde CRÍTICA exige uma observação explicando o motivo." };
  }

  // etapa inicial do pipeline (vinda do Kanban de Operação); padrão do schema se ausente
  const stage = String(formData.get("pipelineStage") || "");
  const stageValid =
    stage &&
    ((PIPELINE_STAGES as readonly string[]).includes(stage) ||
      (await isValidOptionValue("operation", "pipeline", stage)));

  const [client] = await db
    .insert(clients)
    .values({
      ...d,
      ...(stageValid ? { pipelineStage: stage as PipelineStage } : {}),
      startDate: d.startDate ? new Date(d.startDate) : null,
      strategistId: d.strategistId || null,
      trafficManager1Id: d.trafficManager1Id || null,
      trafficManager2Id: d.trafficManager2Id || null,
      mainResponsibleId: d.mainResponsibleId || null,
    })
    .returning();

  await logActivity({
    userId: auth.session.userId,
    action: "client.created",
    entityType: "client",
    entityId: client.id,
    metadata: { name: client.name },
  });
  await emitEvent("CLIENT_CREATED", { clientId: client.id, actorId: auth.session.userId });

  revalidatePath("/clientes");
  redirect(`/clientes/${client.id}`);
}

export async function updateClient(
  clientId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await checkPermission("clients.update");
  if (!auth.ok) return { error: auth.error };

  const parsed = parseClientForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const d = parsed.data;

  const existing = await db.query.clients.findFirst({ where: eq(clients.id, clientId) });
  if (!existing) return { error: "Cliente não encontrado." };

  if (d.status === "PERDIDO" && existing.status !== "PERDIDO") {
    return { error: "Para marcar como PERDIDO use a ação específica, que exige motivo de churn." };
  }
  if (d.healthStatus === "CRITICO" && !d.notes) {
    return { error: "Cliente com saúde CRÍTICA exige uma observação explicando o motivo." };
  }

  await db
    .update(clients)
    .set({
      ...d,
      startDate: d.startDate ? new Date(d.startDate) : null,
      strategistId: d.strategistId || null,
      trafficManager1Id: d.trafficManager1Id || null,
      trafficManager2Id: d.trafficManager2Id || null,
      mainResponsibleId: d.mainResponsibleId || null,
    })
    .where(eq(clients.id, clientId));

  const changes: Record<string, unknown> = {};
  const responsibleFields = [
    "strategistId",
    "trafficManager1Id",
    "trafficManager2Id",
    "mainResponsibleId",
  ] as const;
  for (const f of responsibleFields) {
    if ((existing[f] ?? null) !== (d[f] || null)) changes[f] = { from: existing[f], to: d[f] || null };
  }
  if (Object.keys(changes).length) {
    await logActivity({
      userId: auth.session.userId,
      action: "client.responsiblesChanged",
      entityType: "client",
      entityId: clientId,
      metadata: changes,
    });
  }
  if (existing.healthStatus !== d.healthStatus) {
    await registerHealthChange(clientId, existing.healthStatus, d.healthStatus, d.notes ?? null, auth.session.userId);
  }
  await logActivity({
    userId: auth.session.userId,
    action: "client.updated",
    entityType: "client",
    entityId: clientId,
  });

  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/clientes");
  return { success: "Cliente atualizado." };
}

async function registerHealthChange(
  clientId: string,
  from: HealthStatus,
  to: HealthStatus,
  reason: string | null,
  actorId: string,
) {
  const { clientHealthLogs } = await import("@/db/schema");
  await db.insert(clientHealthLogs).values({
    clientId,
    previousStatus: from,
    newStatus: to,
    reason,
    changedById: actorId,
  });
  await logActivity({
    userId: actorId,
    action: "client.healthChanged",
    entityType: "client",
    entityId: clientId,
    metadata: { from, to, reason },
  });
  await emitEvent("CLIENT_HEALTH_CHANGED", {
    clientId,
    fromHealth: from,
    toHealth: to,
    actorId,
  });
}

export async function changeClientHealth(
  clientId: string,
  newStatus: string,
  reason: string,
): Promise<ActionState> {
  const auth = await checkPermission("clients.update");
  if (!auth.ok) return { error: auth.error };
  if (!HEALTH_STATUSES.includes(newStatus as HealthStatus)) return { error: "Status de saúde inválido." };
  if (newStatus === "CRITICO" && reason.trim().length < 5) {
    return { error: "Mudança para CRÍTICO exige uma observação (mínimo 5 caracteres)." };
  }

  const existing = await db.query.clients.findFirst({ where: eq(clients.id, clientId) });
  if (!existing) return { error: "Cliente não encontrado." };
  if (existing.healthStatus === newStatus) return { error: "O cliente já está neste status de saúde." };

  await db
    .update(clients)
    .set({ healthStatus: newStatus as HealthStatus })
    .where(eq(clients.id, clientId));
  await registerHealthChange(
    clientId,
    existing.healthStatus,
    newStatus as HealthStatus,
    reason.trim() || null,
    auth.session.userId,
  );

  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/clientes");
  return { success: "Saúde da conta atualizada." };
}

export async function toggleAdsStatus(clientId: string, newStatus: AdsStatus): Promise<ActionState> {
  const auth = await checkPermission("clients.update");
  if (!auth.ok) return { error: auth.error };

  const existing = await db.query.clients.findFirst({ where: eq(clients.id, clientId) });
  if (!existing) return { error: "Cliente não encontrado." };

  await db.update(clients).set({ adsStatus: newStatus }).where(eq(clients.id, clientId));
  await logActivity({
    userId: auth.session.userId,
    action: "client.adsStatusChanged",
    entityType: "client",
    entityId: clientId,
    metadata: { from: existing.adsStatus, to: newStatus },
  });

  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/clientes");
  return { success: `Status de anúncios alterado para ${newStatus}.` };
}

export async function markClientLost(
  clientId: string,
  churnReason: string,
  churnDate: string,
): Promise<ActionState> {
  const auth = await checkPermission("clients.moveStatus");
  if (!auth.ok) return { error: auth.error };
  if (churnReason.trim().length < 5) return { error: "Informe o motivo do churn (mínimo 5 caracteres)." };
  if (!churnDate) return { error: "Informe a data da perda." };

  const existing = await db.query.clients.findFirst({ where: eq(clients.id, clientId) });
  if (!existing) return { error: "Cliente não encontrado." };

  await db
    .update(clients)
    .set({
      status: "PERDIDO",
      pipelineStage: "CLIENTE_PERDIDO",
      churnReason: churnReason.trim(),
      churnDate: new Date(churnDate),
    })
    .where(eq(clients.id, clientId));

  await logActivity({
    userId: auth.session.userId,
    action: "client.markedLost",
    entityType: "client",
    entityId: clientId,
    metadata: { churnReason: churnReason.trim(), churnDate },
  });
  await emitEvent("CLIENT_MARKED_LOST", { clientId, actorId: auth.session.userId });

  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/clientes");
  revalidatePath("/operacao");
  return { success: "Cliente marcado como perdido." };
}

export type MeetingInput = {
  title: string;
  meetingDate: string;
  meetingType: string;
  status: string;
  participants?: string;
  responsibleId?: string;
  meetLink?: string;
  summary?: string;
  nextSteps?: string;
};

export async function registerMeeting(clientId: string, input: MeetingInput): Promise<ActionState> {
  const auth = await checkPermission("clients.update");
  if (!auth.ok) return { error: auth.error };
  if (!input.title.trim()) return { error: "Informe o título da reunião." };
  if (!input.meetingDate) return { error: "Informe a data/hora da reunião." };
  if (input.meetLink && !/^https?:\/\//i.test(input.meetLink.trim())) {
    return { error: "O link da reunião deve começar com http(s)://" };
  }
  const { MEETING_STATUSES, MEETING_TYPES } = await import("@/db/schema");
  const type = (MEETING_TYPES as readonly string[]).includes(input.meetingType) ? input.meetingType : "ACOMPANHAMENTO";
  const status = (MEETING_STATUSES as readonly string[]).includes(input.status) ? input.status : "AGENDADA";

  await db.insert(clientMeetings).values({
    clientId,
    title: input.title.trim(),
    meetingDate: new Date(input.meetingDate),
    meetingType: type as (typeof MEETING_TYPES)[number],
    status: status as (typeof MEETING_STATUSES)[number],
    participants: input.participants?.trim() || null,
    responsibleId: input.responsibleId || null,
    meetLink: input.meetLink?.trim() || null,
    summary: input.summary?.trim() || null,
    nextSteps: input.nextSteps?.trim() || null,
    createdById: auth.session.userId,
  });
  await logActivity({
    userId: auth.session.userId,
    action: "client.meetingRegistered",
    entityType: "client",
    entityId: clientId,
    metadata: { title: input.title.trim(), meetingDate: input.meetingDate, type },
  });

  revalidatePath(`/clientes/${clientId}`);
  return { success: "Reunião registrada." };
}

/** Cria uma tarefa de follow-up vinculada ao cliente a partir de uma reunião. */
export async function createMeetingFollowup(meetingId: string): Promise<ActionState> {
  const auth = await checkPermission("tasks.create");
  if (!auth.ok) return { error: auth.error };
  const { clientMeetings: cm, tasks } = await import("@/db/schema");
  const meeting = await db.query.clientMeetings.findFirst({ where: eq(cm.id, meetingId) });
  if (!meeting) return { error: "Reunião não encontrada." };

  await db.insert(tasks).values({
    title: `Follow-up: ${meeting.title}`,
    description: meeting.nextSteps || "Próximos passos da reunião.",
    type: "OPERACIONAL",
    status: "A_FAZER",
    priority: "MEDIA",
    clientId: meeting.clientId,
    assignedToId: meeting.responsibleId ?? auth.session.userId,
    createdById: auth.session.userId,
    dueDate: new Date(Date.now() + 3 * 86400_000),
  });
  await logActivity({
    userId: auth.session.userId,
    action: "client.meetingFollowupCreated",
    entityType: "client",
    entityId: meeting.clientId,
    metadata: { meetingId, title: meeting.title },
  });
  revalidatePath(`/clientes/${meeting.clientId}`);
  revalidatePath("/tarefas");
  return { success: "Tarefa de follow-up criada." };
}

/** Tenta gerar um link do Google Meet (opcional; não bloqueia uso manual). */
export async function generateMeetLink(title: string, meetingDate: string): Promise<{ error?: string; url?: string }> {
  const auth = await checkPermission("clients.update");
  if (!auth.ok) return { error: auth.error };
  const { createGoogleMeetLink } = await import("@/lib/google-meet");
  const result = await createGoogleMeetLink({
    title: title || "Reunião",
    startsAt: meetingDate ? new Date(meetingDate) : new Date(),
  });
  return result.ok ? { url: result.url } : { error: result.error };
}

export async function saveOperationalProfile(
  clientId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await checkPermission("clients.update");
  if (!auth.ok) return { error: auth.error };

  const parsed = operationalProfileSchema.safeParse({
    platforms: formData.getAll("platforms").map(String),
    averageDailyBudget: formData.get("averageDailyBudget") || undefined,
    campaignObjective: formData.get("campaignObjective") ?? undefined,
    campaignTypes: formData.get("campaignTypes") ?? undefined,
    offerDescription: formData.get("offerDescription") ?? undefined,
    funnelNotes: formData.get("funnelNotes") ?? undefined,
    serviceRules: formData.get("serviceRules") ?? undefined,
    monthlyMeetingRequired: formData.get("monthlyMeetingRequired") === "on",
    briefingText: formData.get("briefingText") ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const d = parsed.data;

  const values = {
    platforms: d.platforms,
    averageDailyBudget: d.averageDailyBudget ?? null,
    campaignObjective: d.campaignObjective ?? null,
    campaignTypes: d.campaignTypes ? d.campaignTypes.split(",").map((s) => s.trim()).filter(Boolean) : [],
    offerDescription: d.offerDescription ?? null,
    funnelNotes: d.funnelNotes ?? null,
    serviceRules: d.serviceRules ?? null,
    monthlyMeetingRequired: d.monthlyMeetingRequired,
    briefingText: d.briefingText ?? null,
  };

  const existing = await db.query.clientOperationalProfiles.findFirst({
    where: eq(clientOperationalProfiles.clientId, clientId),
  });
  if (existing) {
    await db
      .update(clientOperationalProfiles)
      .set(values)
      .where(eq(clientOperationalProfiles.clientId, clientId));
  } else {
    await db.insert(clientOperationalProfiles).values({ clientId, ...values });
  }

  await logActivity({
    userId: auth.session.userId,
    action: "client.operationalProfileUpdated",
    entityType: "client",
    entityId: clientId,
  });

  revalidatePath(`/clientes/${clientId}`);
  return { success: "Perfil operacional salvo." };
}
