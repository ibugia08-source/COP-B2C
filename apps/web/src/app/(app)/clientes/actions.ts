"use server";

import { eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
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
import type { SessionPayload } from "@/lib/auth/session";
import { emitEvent } from "@/lib/automations/engine";
import {
  assertChurn,
  assertCriticalNeedsNote,
  CLIENT_FIELD_ENUM,
  denyClientOutOfScope,
  EDITABLE_CLIENT_FIELDS,
} from "@/lib/clients/rules";
import { deriveClientStatus } from "@/lib/clients/state";
import { isValidOptionValue } from "@/lib/config-options";
import { cascadeSafeDelete } from "@/lib/safe-delete";
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
    healthStatus: formData.get("healthStatus"),
    adsStatus: formData.get("adsStatus"),
    strategistId: formData.get("strategistId") ?? undefined,
    trafficManager1Id: formData.get("trafficManager1Id") ?? undefined,
    trafficManager2Id: formData.get("trafficManager2Id") ?? undefined,
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

  const criticalError = assertCriticalNeedsNote(d.healthStatus, d.notes);
  if (criticalError) return { error: criticalError };

  // etapa inicial do pipeline (vinda do Kanban de Operação); padrão do schema se ausente
  const stage = String(formData.get("pipelineStage") || "");
  const stageValid =
    stage &&
    ((PIPELINE_STAGES as readonly string[]).includes(stage) ||
      (await isValidOptionValue("operation", "pipeline", stage)));

  const effectiveStage: PipelineStage = stageValid ? (stage as PipelineStage) : "NOVO_CLIENTE";
  // cliente novo entra no fim da fila (maior boardOrder do quadro)
  const [agg] = await db.select({ m: max(clients.boardOrder) }).from(clients);
  const nextBoardOrder = (agg?.m ?? 0) + 10;
  const [client] = await db
    .insert(clients)
    .values({
      ...d,
      pipelineStage: effectiveStage,
      // status é sempre derivado (nunca vem do formulário).
      status: deriveClientStatus({ pipelineStage: effectiveStage, healthStatus: d.healthStatus, isPaused: false }),
      boardOrder: nextBoardOrder,
      startDate: d.startDate ? new Date(d.startDate) : null,
      strategistId: d.strategistId || null,
      trafficManager1Id: d.trafficManager1Id || null,
      trafficManager2Id: d.trafficManager2Id || null,
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

  const criticalError = assertCriticalNeedsNote(d.healthStatus, d.notes);
  if (criticalError) return { error: criticalError };

  await db
    .update(clients)
    .set({
      ...d,
      // status é sempre derivado — a saúde do form pode mudá-lo (ex.: CRÍTICO → EM_RISCO).
      status: deriveClientStatus({
        pipelineStage: existing.pipelineStage,
        healthStatus: d.healthStatus,
        isPaused: existing.isPaused,
      }),
      startDate: d.startDate ? new Date(d.startDate) : null,
      strategistId: d.strategistId || null,
      trafficManager1Id: d.trafficManager1Id || null,
      trafficManager2Id: d.trafficManager2Id || null,
    })
    .where(eq(clients.id, clientId));

  const changes: Record<string, unknown> = {};
  const responsibleFields = ["strategistId", "trafficManager1Id", "trafficManager2Id"] as const;
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
  revalidatePath("/operacao");
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
  const criticalError = assertCriticalNeedsNote(newStatus, reason);
  if (criticalError) return { error: criticalError };

  const existing = await db.query.clients.findFirst({ where: eq(clients.id, clientId) });
  if (!existing) return { error: "Cliente não encontrado." };
  if (existing.healthStatus === newStatus) return { error: "O cliente já está neste status de saúde." };

  const denied = await denyClientOutOfScope(auth.session, clientId, "changeClientHealth");
  if (denied) return denied;

  await db
    .update(clients)
    .set({
      healthStatus: newStatus as HealthStatus,
      // status é derivado: mudar a saúde precisa recomputar (ex.: CRITICO → EM_RISCO)
      status: deriveClientStatus({
        pipelineStage: existing.pipelineStage,
        healthStatus: newStatus as HealthStatus,
        isPaused: existing.isPaused,
      }),
    })
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
  revalidatePath("/operacao");
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
  revalidatePath("/operacao");
  return { success: `Status de anúncios alterado para ${newStatus}.` };
}

/**
 * Pausa/retoma comercialmente um cliente (eixo ortogonal à etapa da esteira).
 * Pausar NÃO muda a etapa: ao retomar, o cliente continua onde estava. O
 * `status` é sempre recalculado por deriveClientStatus.
 */
export async function togglePause(
  clientId: string,
  pause: boolean,
  reason?: string,
): Promise<ActionState> {
  const auth = await checkPermission("clients.update");
  if (!auth.ok) return { error: auth.error };

  const existing = await db.query.clients.findFirst({ where: eq(clients.id, clientId) });
  if (!existing) return { error: "Cliente não encontrado." };
  if (existing.pipelineStage === "CLIENTE_PERDIDO") {
    return { error: "Cliente perdido não pode ser pausado. Reative-o na esteira primeiro." };
  }

  const denied = await denyClientOutOfScope(auth.session, clientId, "togglePause");
  if (denied) return denied;

  const status = deriveClientStatus({
    pipelineStage: existing.pipelineStage,
    healthStatus: existing.healthStatus,
    isPaused: pause,
  });

  await db
    .update(clients)
    .set({
      isPaused: pause,
      pausedAt: pause ? new Date() : null,
      pauseReason: pause ? reason?.trim() || null : null,
      status,
    })
    .where(eq(clients.id, clientId));

  await logActivity({
    userId: auth.session.userId,
    action: pause ? "client.paused" : "client.resumed",
    entityType: "client",
    entityId: clientId,
    metadata: { reason: reason?.trim() || undefined },
  });

  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/clientes");
  revalidatePath("/operacao");
  return { success: pause ? "Cliente pausado." : "Cliente retomado." };
}

export async function markClientLost(
  clientId: string,
  churnReason: string,
  churnDate: string,
): Promise<ActionState> {
  const auth = await checkPermission("clients.moveStatus");
  if (!auth.ok) return { error: auth.error };
  const churnError = assertChurn(churnReason, churnDate);
  if (churnError) return { error: churnError };

  const existing = await db.query.clients.findFirst({ where: eq(clients.id, clientId) });
  if (!existing) return { error: "Cliente não encontrado." };

  const denied = await denyClientOutOfScope(auth.session, clientId, "markClientLost", "clients.moveStatus");
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

async function applyClientField(
  ids: string[],
  field: string,
  value: string,
  session: SessionPayload,
): Promise<BulkResult> {
  const userId = session.userId;
  if (!EDITABLE_CLIENT_FIELDS.has(field)) return { ok: 0, fail: 0, error: "Campo não editável." };
  // Saúde CRÍTICA exige motivo — feito na ficha, não na edição rápida.
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
    const setObj = { [field]: dbValue } as Partial<typeof clients.$inferInsert>;
    // saúde é eixo do status derivado — recomputa junto (ex.: sair de CRITICO)
    if (field === "healthStatus") {
      setObj.status = deriveClientStatus({
        pipelineStage: existing.pipelineStage,
        healthStatus: dbValue as HealthStatus,
        isPaused: existing.isPaused,
      });
    }
    await db.update(clients).set(setObj).where(eq(clients.id, id));
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

/**
 * Edição rápida (modal da carteira): atualiza os campos operacionais de um
 * cliente numa única escrita. Só recebe os campos realmente alterados.
 */
export async function updateClientQuick(
  clientId: string,
  fields: Record<string, string>,
): Promise<ActionState> {
  const auth = await checkPermission("clients.update");
  if (!auth.ok) return { error: auth.error };

  const existing = await db.query.clients.findFirst({ where: eq(clients.id, clientId) });
  if (!existing) return { error: "Cliente não encontrado." };
  const denied = await denyClientOutOfScope(auth.session, clientId, "updateClientQuick");
  if (denied) return denied;

  const set: Record<string, unknown> = {};
  let healthTo: HealthStatus | null = null;
  for (const [field, raw] of Object.entries(fields)) {
    if (!EDITABLE_CLIENT_FIELDS.has(field)) return { error: `Campo não editável: ${field}.` };
    if (field === "healthStatus" && raw === "CRITICO") {
      return { error: "Saúde CRÍTICA exige um motivo — altere na ficha completa do cliente." };
    }
    const enumValues = CLIENT_FIELD_ENUM[field];
    const value = field === "trafficManager1Id" || field === "niche" ? raw || null : raw;
    if (enumValues && (value === null || !enumValues.includes(value as string))) {
      return { error: "Valor inválido." };
    }
    set[field] = value;
    if (field === "healthStatus" && existing.healthStatus !== value) healthTo = value as HealthStatus;
  }
  if (Object.keys(set).length === 0) return { error: "Nada para atualizar." };

  if (healthTo) {
    set.status = deriveClientStatus({
      pipelineStage: existing.pipelineStage,
      healthStatus: healthTo,
      isPaused: existing.isPaused,
    });
  }

  await db.update(clients).set(set as Partial<typeof clients.$inferInsert>).where(eq(clients.id, clientId));

  if (healthTo) {
    await db.insert(clientHealthLogs).values({
      clientId,
      previousStatus: existing.healthStatus as HealthStatus,
      newStatus: healthTo,
      reason: "Edição rápida na carteira",
      changedById: auth.session.userId,
    });
  }

  await logActivity({
    userId: auth.session.userId,
    action: "client.quickEdited",
    entityType: "client",
    entityId: clientId,
    metadata: { fields: Object.keys(set).filter((k) => k !== "status") },
  });

  revalidatePath("/clientes");
  revalidatePath("/operacao");
  revalidatePath(`/clientes/${clientId}`);
  return { success: "Cliente atualizado." };
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
  const denied = await denyClientOutOfScope(auth.session, clientId, "deleteClientRow", "clients.delete");
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
    if (await denyClientOutOfScope(auth.session, id, "bulkDeleteClientsList", "clients.delete")) continue;
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
