"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  ADS_STATUSES,
  AGENCY_BRANDS,
  BUSINESS_MODELS,
  CLIENT_STATUSES,
  clientHealthLogs,
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
import { canAccessClient } from "@/lib/auth/ownership";
import type { SessionPayload } from "@/lib/auth/session";
import { emitEvent } from "@/lib/automations/engine";
import { isValidOptionValue } from "@/lib/config-options";
import { cascadeSafeDelete } from "@/lib/safe-delete";
import { clientFormSchema, operationalProfileSchema } from "@/lib/validations/client";

export type ActionState = { error?: string; success?: string };

/**
 * Gate de ownership: escrever num cliente exige ser um dos responsáveis
 * (estrategista, gestores, responsável principal) — OWNER/ADMIN operam tudo.
 * Negações são registradas em activityLogs.
 */
async function denyClientOutOfScope(
  session: SessionPayload,
  clientId: string,
  action: string,
): Promise<ActionState | null> {
  if (await canAccessClient(session, clientId)) return null;
  await logActivity({
    userId: session.userId,
    action: "client.ownershipDenied",
    entityType: "client",
    entityId: clientId,
    metadata: { action, reason: "ownership_scope" },
  });
  return { error: "Você não é responsável por este cliente." };
}

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

  const denied = await denyClientOutOfScope(auth.session, clientId, "updateClient");
  if (denied) return denied;

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

  const denied = await denyClientOutOfScope(auth.session, clientId, "changeClientHealth");
  if (denied) return denied;

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

  const denied = await denyClientOutOfScope(auth.session, clientId, "toggleAdsStatus");
  if (denied) return denied;

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

  const denied = await denyClientOutOfScope(auth.session, clientId, "markClientLost");
  if (denied) return denied;

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
  const denied = await denyClientOutOfScope(auth.session, clientId, "registerMeeting");
  if (denied) return denied;

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

  const denied = await denyClientOutOfScope(auth.session, meeting.clientId, "createMeetingFollowup");
  if (denied) return denied;

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

  const denied = await denyClientOutOfScope(auth.session, clientId, "saveOperationalProfile");
  if (denied) return denied;

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

// ---------------------------------------------------------------------------
// Edição inline e ações em massa na LISTA de clientes
// ---------------------------------------------------------------------------

export type BulkResult = { ok: number; fail: number; error?: string; success?: string };

const CLIENT_FIELD_ENUM: Record<string, readonly string[]> = {
  agencyBrand: AGENCY_BRANDS,
  businessModel: BUSINESS_MODELS,
  status: CLIENT_STATUSES,
  healthStatus: HEALTH_STATUSES,
  adsStatus: ADS_STATUSES,
};
const EDITABLE_FIELDS = new Set([
  "agencyBrand",
  "businessModel",
  "niche",
  "status",
  "healthStatus",
  "adsStatus",
  "trafficManager1Id",
]);

async function applyClientField(
  ids: string[],
  field: string,
  value: string,
  session: SessionPayload,
): Promise<BulkResult> {
  const userId = session.userId;
  if (!EDITABLE_FIELDS.has(field)) return { ok: 0, fail: 0, error: "Campo não editável." };
  // Regras que exigem fluxo próprio (motivo) — bloqueadas na edição rápida
  if (field === "status" && value === "PERDIDO") {
    return { ok: 0, fail: 0, error: "Para marcar como PERDIDO use a ação de churn na ficha do cliente." };
  }
  if (field === "healthStatus" && value === "CRITICO") {
    return { ok: 0, fail: 0, error: "Saúde CRÍTICA exige um motivo — altere na ficha do cliente." };
  }
  const enumValues = CLIENT_FIELD_ENUM[field];
  if (enumValues && (!value || !enumValues.includes(value))) {
    return { ok: 0, fail: 0, error: "Valor inválido." };
  }
  // gestor e nicho aceitam vazio (= remover)
  const dbValue = field === "trafficManager1Id" || field === "niche" ? value || null : value;

  let ok = 0;
  const touched: string[] = [];
  for (const id of ids) {
    const existing = await db.query.clients.findFirst({ where: eq(clients.id, id) });
    if (!existing) continue;
    if (await denyClientOutOfScope(session, id, `applyClientField:${field}`)) continue;
    await db.update(clients).set({ [field]: dbValue } as Partial<typeof clients.$inferInsert>).where(eq(clients.id, id));
    if (field === "healthStatus" && existing.healthStatus !== dbValue) {
      await db.insert(clientHealthLogs).values({
        clientId: id,
        previousStatus: existing.healthStatus as HealthStatus,
        newStatus: dbValue as HealthStatus,
        reason: "Alteração rápida na lista",
        changedById: userId,
      });
    }
    touched.push(id);
    ok++;
  }
  await logActivity({
    userId,
    action: ids.length > 1 ? "client.bulkFieldEdited" : "client.fieldEdited",
    entityType: "client",
    entityId: ids.length === 1 ? ids[0] : null,
    metadata: { field, count: ok },
  });
  revalidatePath("/clientes");
  revalidatePath("/operacao");
  for (const id of touched) revalidatePath(`/clientes/${id}`);
  return { ok, fail: ids.length - ok, success: `${ok} cliente(s) atualizado(s).` };
}

/** Edição inline de um campo do cliente direto na linha da lista. */
export async function updateClientField(
  clientId: string,
  field: string,
  value: string,
): Promise<ActionState> {
  const auth = await checkPermission("clients.update");
  if (!auth.ok) return { error: auth.error };
  const r = await applyClientField([clientId], field, value, auth.session);
  if (r.error) return { error: r.error };
  if (!r.ok) return { error: "Você não é responsável por este cliente." };
  return { success: "Atualizado." };
}

async function bulkField(ids: string[], field: string, value: string): Promise<BulkResult> {
  const auth = await checkPermission("clients.update");
  if (!auth.ok) return { ok: 0, fail: 0, error: auth.error };
  return applyClientField(ids, field, value, auth.session);
}

// Wrappers (ids, value) para a barra de ações em massa
export async function bulkClientEmpresa(ids: string[], v: string): Promise<BulkResult> {
  return bulkField(ids, "agencyBrand", v);
}
export async function bulkClientModelo(ids: string[], v: string): Promise<BulkResult> {
  return bulkField(ids, "businessModel", v);
}
export async function bulkClientStatus(ids: string[], v: string): Promise<BulkResult> {
  return bulkField(ids, "status", v);
}
export async function bulkClientSaude(ids: string[], v: string): Promise<BulkResult> {
  return bulkField(ids, "healthStatus", v);
}
export async function bulkClientAds(ids: string[], v: string): Promise<BulkResult> {
  return bulkField(ids, "adsStatus", v);
}
export async function bulkClientGestor(ids: string[], v: string): Promise<BulkResult> {
  return bulkField(ids, "trafficManager1Id", v);
}

/** Exclui um cliente pela lista (FK-safe). */
export async function deleteClientRow(clientId: string): Promise<ActionState> {
  const auth = await checkPermission("clients.delete");
  if (!auth.ok) return { error: auth.error };
  const c = await db.query.clients.findFirst({ where: eq(clients.id, clientId) });
  if (!c) return { error: "Cliente não encontrado." };
  const denied = await denyClientOutOfScope(auth.session, clientId, "deleteClientRow");
  if (denied) return denied;
  try {
    await cascadeSafeDelete("clients", clientId);
  } catch {
    return { error: "Não foi possível excluir com segurança. Marque como perdido/pausado." };
  }
  await logActivity({ userId: auth.session.userId, action: "client.deleted", entityType: "client", entityId: clientId, metadata: { name: c.name } });
  revalidatePath("/clientes");
  revalidatePath("/operacao");
  return { success: "Cliente excluído." };
}

export async function bulkDeleteClientsList(ids: string[]): Promise<BulkResult> {
  const auth = await checkPermission("clients.delete");
  if (!auth.ok) return { ok: 0, fail: 0, error: auth.error };
  let ok = 0;
  for (const id of ids) {
    if (await denyClientOutOfScope(auth.session, id, "bulkDeleteClientsList")) continue;
    try {
      await cascadeSafeDelete("clients", id);
      ok++;
    } catch {
      /* pula os que não podem ser removidos com segurança */
    }
  }
  await logActivity({ userId: auth.session.userId, action: "client.bulkDeleted", entityType: "client", metadata: { count: ok } });
  revalidatePath("/clientes");
  revalidatePath("/operacao");
  return { ok, fail: ids.length - ok, success: `${ok} cliente(s) excluído(s).${ids.length - ok ? ` ${ids.length - ok} não puderam ser removidos.` : ""}` };
}
