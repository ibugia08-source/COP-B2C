"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  CREATIVE_OBJECTIVES,
  CREATIVE_PLATFORMS,
  CREATIVE_STATUSES,
  CREATIVE_TYPES,
  creativeRequests,
  type CreativeStatus,
} from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { checkPermission } from "@/lib/auth/guard";
import { emitEvent } from "@/lib/automations/engine";

export type ActionState = { error?: string; success?: string; creativeId?: string };

const creativeSchema = z.object({
  clientId: z.string().min(1, "Selecione o cliente"),
  title: z.string().trim().min(3, "Título muito curto"),
  objective: z.enum(CREATIVE_OBJECTIVES).optional(),
  platform: z.enum(CREATIVE_PLATFORMS).optional(),
  creativeType: z.enum(CREATIVE_TYPES).optional(),
  copyResponsibleId: z.string().optional(),
  assignedToId: z.string().optional(),
  dueDate: z.string().optional(),
  briefing: z.string().trim().optional(),
  offer: z.string().trim().optional(),
  cta: z.string().trim().optional(),
  fileLinks: z.string().trim().optional(),
  observations: z.string().trim().optional(),
});

function parseForm(formData: FormData) {
  return creativeSchema.safeParse({
    clientId: formData.get("clientId"),
    title: formData.get("title"),
    objective: formData.get("objective") || undefined,
    platform: formData.get("platform") || undefined,
    creativeType: formData.get("creativeType") || undefined,
    copyResponsibleId: formData.get("copyResponsibleId") || undefined,
    assignedToId: formData.get("assignedToId") || undefined,
    dueDate: formData.get("dueDate") || undefined,
    briefing: formData.get("briefing") || undefined,
    offer: formData.get("offer") || undefined,
    cta: formData.get("cta") || undefined,
    fileLinks: formData.get("fileLinks") || undefined,
    observations: formData.get("observations") || undefined,
  });
}

export async function createCreative(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await checkPermission("tasks.create");
  if (!auth.ok) return { error: auth.error };

  const parsed = parseForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const d = parsed.data;

  const [creative] = await db
    .insert(creativeRequests)
    .values({
      clientId: d.clientId,
      title: d.title,
      objective: d.objective ?? null,
      platform: d.platform ?? null,
      creativeType: d.creativeType ?? null,
      copyResponsibleId: d.copyResponsibleId || null,
      assignedToId: d.assignedToId || null,
      requestedById: auth.session.userId,
      dueDate: d.dueDate ? new Date(d.dueDate) : null,
      briefing: d.briefing ?? null,
      offer: d.offer ?? null,
      cta: d.cta ?? null,
      fileLinks: d.fileLinks ?? null,
      observations: d.observations ?? null,
    })
    .returning();

  await logActivity({
    userId: auth.session.userId,
    action: "creative.created",
    entityType: "creative",
    entityId: creative.id,
    metadata: { title: creative.title, clientId: creative.clientId },
  });
  await emitEvent("CREATIVE_REQUEST_CREATED", {
    creativeId: creative.id,
    clientId: creative.clientId,
    actorId: auth.session.userId,
  });

  revalidatePath("/criativos");
  revalidatePath(`/clientes/${creative.clientId}`);
  return { success: "Solicitação criada.", creativeId: creative.id };
}

export async function updateCreative(
  creativeId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await checkPermission("tasks.update");
  if (!auth.ok) return { error: auth.error };

  const parsed = parseForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const d = parsed.data;

  const existing = await db.query.creativeRequests.findFirst({ where: eq(creativeRequests.id, creativeId) });
  if (!existing) return { error: "Criativo não encontrado." };

  await db
    .update(creativeRequests)
    .set({
      clientId: d.clientId,
      title: d.title,
      objective: d.objective ?? null,
      platform: d.platform ?? null,
      creativeType: d.creativeType ?? null,
      copyResponsibleId: d.copyResponsibleId || null,
      assignedToId: d.assignedToId || null,
      dueDate: d.dueDate ? new Date(d.dueDate) : null,
      briefing: d.briefing ?? null,
      offer: d.offer ?? null,
      cta: d.cta ?? null,
      fileLinks: d.fileLinks ?? null,
      observations: d.observations ?? null,
    })
    .where(eq(creativeRequests.id, creativeId));

  revalidatePath("/criativos");
  revalidatePath(`/criativos/${creativeId}`);
  return { success: "Criativo atualizado." };
}

export async function changeCreativeStatus(
  creativeId: string,
  status: CreativeStatus,
  extras?: { rejectionReason?: string; publishedLink?: string; clientFeedback?: string },
): Promise<ActionState> {
  const auth = await checkPermission("tasks.update");
  if (!auth.ok) return { error: auth.error };
  if (!CREATIVE_STATUSES.includes(status)) return { error: "Status inválido." };

  const existing = await db.query.creativeRequests.findFirst({ where: eq(creativeRequests.id, creativeId) });
  if (!existing) return { error: "Criativo não encontrado." };

  // Regras de negócio
  if (status === "EM_DESIGN" && !existing.briefing?.trim()) {
    return { error: "Solicitação sem briefing não pode ir para EM DESIGN. Preencha o briefing primeiro." };
  }
  if (status === "REPROVADO" && (!extras?.rejectionReason || extras.rejectionReason.trim().length < 5)) {
    return { error: "Reprovar exige um motivo (mínimo 5 caracteres)." };
  }
  if (status === "PUBLICADO" && !extras?.publishedLink?.trim()) {
    return { error: "Publicado exige o link final do criativo." };
  }

  await db
    .update(creativeRequests)
    .set({
      status,
      approvedAt: status === "APROVADO" ? new Date() : existing.approvedAt,
      deliveredAt: status === "PUBLICADO" ? new Date() : existing.deliveredAt,
      rejectionReason: status === "REPROVADO" ? extras!.rejectionReason!.trim() : existing.rejectionReason,
      publishedLink: status === "PUBLICADO" ? extras!.publishedLink!.trim() : existing.publishedLink,
      clientFeedback: extras?.clientFeedback?.trim() || existing.clientFeedback,
    })
    .where(eq(creativeRequests.id, creativeId));

  await logActivity({
    userId: auth.session.userId,
    action: `creative.${status === "APROVADO" ? "approved" : status === "REPROVADO" ? "rejected" : "statusChanged"}`,
    entityType: "creative",
    entityId: creativeId,
    metadata: { from: existing.status, to: status, reason: extras?.rejectionReason },
  });
  await emitEvent("CREATIVE_STATUS_CHANGED", {
    creativeId,
    clientId: existing.clientId,
    from: existing.status,
    to: status,
    actorId: auth.session.userId,
  });

  revalidatePath("/criativos");
  revalidatePath(`/criativos/${creativeId}`);
  revalidatePath(`/clientes/${existing.clientId}`);
  return { success: "Status do criativo atualizado." };
}
