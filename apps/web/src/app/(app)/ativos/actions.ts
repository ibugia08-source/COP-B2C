"use server";

import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  ASSET_COMMENT_TYPES,
  ASSET_GROUP_TYPES,
  ASSET_PLATFORMS,
  ASSET_PRIORITIES,
  ASSET_STATUSES,
  ASSET_TYPES,
  SECRET_TYPES,
  digitalAssetAttachments,
  digitalAssetComments,
  digitalAssetGroups,
  digitalAssetSecrets,
  digitalAssetStatusHistory,
  digitalAssets,
  tasks,
  type AssetStatus,
} from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { writeAssetAudit } from "@/lib/assets/audit";
import { checkPermission } from "@/lib/auth/guard";
import { RESTRICTED_SECRET_TYPES_FOR_SOCIAL, roleHasPermission } from "@/lib/auth/permissions";
import { encryptSecret, decryptSecret, maskSecret } from "@/lib/crypto";
import { notifyRole, notifyUser } from "@/lib/notify";

export type ActionState = { error?: string; success?: string; assetId?: string };

const UPLOADS_DIR = join(process.cwd(), "uploads", "ativos");
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

function revalidateAsset(assetId?: string, clientId?: string | null) {
  revalidatePath("/ativos");
  if (assetId) revalidatePath(`/ativos/${assetId}`);
  if (clientId) revalidatePath(`/clientes/${clientId}`);
}

// ---------------------------------------------------------------------------
// Grupos
// ---------------------------------------------------------------------------

const groupSchema = z.object({
  name: z.string().trim().min(2, "Nome do grupo é obrigatório"),
  description: z.string().trim().optional(),
  type: z.enum(ASSET_GROUP_TYPES),
  clientId: z.string().optional(),
  status: z.enum(["ATIVO", "PAUSADO", "ARQUIVADO"]),
});

export async function saveGroup(
  groupId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await checkPermission("digital_assets.manage_groups");
  if (!auth.ok) return { error: auth.error };

  const parsed = groupSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    type: formData.get("type"),
    clientId: formData.get("clientId") || undefined,
    status: formData.get("status") || "ATIVO",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const d = parsed.data;

  const values = {
    name: d.name,
    description: d.description ?? null,
    type: d.type,
    clientId: d.clientId || null,
    status: d.status,
  };

  if (groupId) {
    await db.update(digitalAssetGroups).set(values).where(eq(digitalAssetGroups.id, groupId));
  } else {
    await db.insert(digitalAssetGroups).values({ ...values, createdById: auth.session.userId });
  }
  revalidatePath("/ativos");
  return { success: groupId ? "Grupo atualizado." : "Grupo criado." };
}

// ---------------------------------------------------------------------------
// Ativos
// ---------------------------------------------------------------------------

const assetSchema = z.object({
  groupId: z.string().min(1, "Selecione o grupo"),
  clientId: z.string().optional(),
  title: z.string().trim().min(2, "Título é obrigatório"),
  description: z.string().trim().optional(),
  assetType: z.enum(ASSET_TYPES),
  platform: z.enum(ASSET_PLATFORMS),
  status: z.enum(ASSET_STATUSES),
  priority: z.enum(ASSET_PRIORITIES),
  ownerUserId: z.string().optional(),
  assignedToId: z.string().optional(),
  loginUrl: z.string().trim().optional(),
  profileUrl: z.string().trim().optional(),
  businessManagerId: z.string().trim().optional(),
  adAccountId: z.string().trim().optional(),
  pageId: z.string().trim().optional(),
  profileId: z.string().trim().optional(),
  externalId: z.string().trim().optional(),
  recoveryEmail: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  tags: z.string().optional(),
  nextReviewAt: z.string().optional(),
});

function parseAssetForm(formData: FormData) {
  return assetSchema.safeParse({
    groupId: formData.get("groupId"),
    clientId: formData.get("clientId") || undefined,
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    assetType: formData.get("assetType"),
    platform: formData.get("platform"),
    status: formData.get("status") || "NAO_INFORMADO",
    priority: formData.get("priority") || "MEDIA",
    ownerUserId: formData.get("ownerUserId") || undefined,
    assignedToId: formData.get("assignedToId") || undefined,
    loginUrl: formData.get("loginUrl") || undefined,
    profileUrl: formData.get("profileUrl") || undefined,
    businessManagerId: formData.get("businessManagerId") || undefined,
    adAccountId: formData.get("adAccountId") || undefined,
    pageId: formData.get("pageId") || undefined,
    profileId: formData.get("profileId") || undefined,
    externalId: formData.get("externalId") || undefined,
    recoveryEmail: formData.get("recoveryEmail") || undefined,
    notes: formData.get("notes") || undefined,
    tags: formData.get("tags") || undefined,
    nextReviewAt: formData.get("nextReviewAt") || undefined,
  });
}

function assetValues(d: z.infer<typeof assetSchema>, userId: string) {
  return {
    groupId: d.groupId,
    clientId: d.clientId || null,
    title: d.title,
    description: d.description ?? null,
    assetType: d.assetType,
    platform: d.platform,
    status: d.status,
    priority: d.priority,
    ownerUserId: d.ownerUserId || null,
    assignedToId: d.assignedToId || null,
    loginUrl: d.loginUrl || null,
    profileUrl: d.profileUrl || null,
    businessManagerId: d.businessManagerId || null,
    adAccountId: d.adAccountId || null,
    pageId: d.pageId || null,
    profileId: d.profileId || null,
    externalId: d.externalId || null,
    recoveryEmail: d.recoveryEmail || null,
    notes: d.notes ?? null,
    tags: d.tags ? d.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    nextReviewAt: d.nextReviewAt ? new Date(d.nextReviewAt) : null,
    updatedById: userId,
  };
}

/** Automações operacionais disparadas por status de ativo. */
async function runStatusAutomations(
  asset: { id: string; title: string; clientId: string | null; assignedToId: string | null },
  newStatus: AssetStatus,
  actorId: string,
) {
  if (newStatus === "BLOQUEADA") {
    await db.insert(digitalAssetComments).values({
      assetId: asset.id,
      authorId: null,
      type: "ALERTA",
      content: "⚠️ Ativo marcado como BLOQUEADA. Descreva o motivo do bloqueio e o plano para recuperação.",
    });
    if (asset.assignedToId) {
      await notifyUser(asset.assignedToId, {
        title: "Ativo digital bloqueado",
        body: asset.title,
        type: "ALERTA",
        entityType: "digitalAsset",
        entityId: asset.id,
      });
    }
    await notifyRole("GESTOR_OPERACIONAL", {
      title: "Ativo digital bloqueado",
      body: asset.title,
      type: "ALERTA",
      entityType: "digitalAsset",
      entityId: asset.id,
    });
  }
  if (newStatus === "PRECISA_DE_DOCUMENTOS") {
    await db.insert(tasks).values({
      title: `Enviar documentos — ${asset.title}`,
      description: "O ativo digital precisa de documentos para desbloqueio/verificação.",
      type: "OPERACIONAL",
      status: "A_FAZER",
      priority: "ALTA",
      clientId: asset.clientId,
      digitalAssetId: asset.id,
      assignedToId: asset.assignedToId,
      createdById: actorId,
    });
    if (asset.assignedToId) {
      await notifyUser(asset.assignedToId, {
        title: "Ativo precisa de documentos — tarefa criada",
        body: asset.title,
        type: "TAREFA",
        entityType: "digitalAsset",
        entityId: asset.id,
      });
    }
  }
  if (newStatus === "PRONTA_PARA_USO" && asset.assignedToId) {
    await notifyUser(asset.assignedToId, {
      title: "Ativo pronto para uso",
      body: asset.title,
      type: "INFO",
      entityType: "digitalAsset",
      entityId: asset.id,
    });
  }
}

export async function createAsset(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await checkPermission("digital_assets.create");
  if (!auth.ok) return { error: auth.error };

  const parsed = parseAssetForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  const [asset] = await db
    .insert(digitalAssets)
    .values({ ...assetValues(parsed.data, auth.session.userId), createdById: auth.session.userId })
    .returning();

  // segredos enviados junto no formulário (template): campos secret_<tipo>_<label>
  let secretCount = 0;
  const canCreateSecrets = roleHasPermission(auth.session.roles, "digital_assets.create_secrets");
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("secret__") || typeof value !== "string" || !value.trim()) continue;
    if (!canCreateSecrets) continue;
    const [, type, ...labelParts] = key.split("__");
    const secretType = SECRET_TYPES.includes(type as never) ? (type as (typeof SECRET_TYPES)[number]) : "OTHER";
    await db.insert(digitalAssetSecrets).values({
      assetId: asset.id,
      secretType,
      label: labelParts.join("__") || secretType,
      encryptedValue: encryptSecret(value),
      maskedPreview: maskSecret(value),
      createdById: auth.session.userId,
    });
    secretCount++;
  }
  if (secretCount > 0) {
    await writeAssetAudit({
      assetId: asset.id,
      userId: auth.session.userId,
      action: "SECRET_CREATED",
      metadata: { count: secretCount, onCreate: true },
    });
  }

  await writeAssetAudit({
    assetId: asset.id,
    userId: auth.session.userId,
    action: "ASSET_CREATED",
    metadata: { title: asset.title, assetType: asset.assetType },
  });
  if (asset.clientId) {
    await logActivity({
      userId: auth.session.userId,
      action: "asset.created",
      entityType: "client",
      entityId: asset.clientId,
      metadata: { title: asset.title, assetId: asset.id },
    });
  }
  if (asset.status === "BLOQUEADA" || asset.status === "PRECISA_DE_DOCUMENTOS") {
    await runStatusAutomations(asset, asset.status, auth.session.userId);
  }

  revalidateAsset(asset.id, asset.clientId);
  return { success: "Ativo criado.", assetId: asset.id };
}

export async function updateAsset(
  assetId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await checkPermission("digital_assets.update");
  if (!auth.ok) return { error: auth.error };

  const parsed = parseAssetForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  const existing = await db.query.digitalAssets.findFirst({ where: eq(digitalAssets.id, assetId) });
  if (!existing) return { error: "Ativo não encontrado." };

  const values = assetValues(parsed.data, auth.session.userId);
  // mudança de status pelo form de edição também gera histórico
  if (values.status !== existing.status) {
    await db.insert(digitalAssetStatusHistory).values({
      assetId,
      oldStatus: existing.status,
      newStatus: values.status,
      reason: "Alterado pela edição do ativo",
      changedById: auth.session.userId,
    });
    await writeAssetAudit({
      assetId,
      userId: auth.session.userId,
      action: "STATUS_CHANGED",
      metadata: { from: existing.status, to: values.status },
    });
    await runStatusAutomations({ ...existing, ...values, id: assetId }, values.status, auth.session.userId);
  }

  await db.update(digitalAssets).set(values).where(eq(digitalAssets.id, assetId));
  await writeAssetAudit({
    assetId,
    userId: auth.session.userId,
    action: "ASSET_UPDATED",
    metadata: { title: values.title },
  });

  revalidateAsset(assetId, existing.clientId ?? values.clientId);
  return { success: "Ativo atualizado.", assetId };
}

export async function archiveAsset(assetId: string): Promise<ActionState> {
  const auth = await checkPermission("digital_assets.archive");
  if (!auth.ok) return { error: auth.error };
  const existing = await db.query.digitalAssets.findFirst({ where: eq(digitalAssets.id, assetId) });
  if (!existing) return { error: "Ativo não encontrado." };

  const restoring = !!existing.archivedAt;
  await db
    .update(digitalAssets)
    .set({
      archivedAt: restoring ? null : new Date(),
      status: restoring ? existing.status : "ARQUIVADA",
    })
    .where(eq(digitalAssets.id, assetId));
  await writeAssetAudit({
    assetId,
    userId: auth.session.userId,
    action: "ASSET_ARCHIVED",
    metadata: { title: existing.title, restored: restoring },
  });
  revalidateAsset(assetId, existing.clientId);
  return { success: restoring ? "Ativo restaurado." : "Ativo arquivado." };
}

/** Duplicar ativo. Segredos só são copiados com confirmação explícita. */
export async function duplicateAsset(assetId: string, copySecrets: boolean): Promise<ActionState> {
  const auth = await checkPermission("digital_assets.create");
  if (!auth.ok) return { error: auth.error };
  const existing = await db.query.digitalAssets.findFirst({
    where: eq(digitalAssets.id, assetId),
    with: { secrets: true },
  });
  if (!existing) return { error: "Ativo não encontrado." };

  const { id: _id, createdAt: _c, updatedAt: _u, secrets, ...rest } = existing;
  void _id; void _c; void _u;
  const [copy] = await db
    .insert(digitalAssets)
    .values({
      ...rest,
      title: `${existing.title} (cópia)`,
      createdById: auth.session.userId,
      updatedById: auth.session.userId,
      archivedAt: null,
    })
    .returning();

  if (copySecrets) {
    const canCreateSecrets = roleHasPermission(auth.session.roles, "digital_assets.create_secrets");
    if (!canCreateSecrets) return { error: "Você não tem permissão para copiar segredos." };
    for (const s of secrets) {
      await db.insert(digitalAssetSecrets).values({
        assetId: copy.id,
        secretType: s.secretType,
        label: s.label,
        encryptedValue: s.encryptedValue, // já criptografado — nunca descriptografa aqui
        maskedPreview: s.maskedPreview,
        createdById: auth.session.userId,
      });
    }
    await writeAssetAudit({
      assetId: copy.id,
      userId: auth.session.userId,
      action: "SECRET_CREATED",
      metadata: { duplicatedFrom: assetId, count: secrets.length },
    });
  }
  await writeAssetAudit({
    assetId: copy.id,
    userId: auth.session.userId,
    action: "ASSET_CREATED",
    metadata: { duplicatedFrom: assetId, copySecrets },
  });
  revalidateAsset(copy.id, copy.clientId);
  return { success: copySecrets ? "Ativo duplicado com segredos." : "Ativo duplicado (sem segredos).", assetId: copy.id };
}

// ---------------------------------------------------------------------------
// Status (com motivo + histórico + automações)
// ---------------------------------------------------------------------------

export async function changeAssetStatus(
  assetId: string,
  newStatus: AssetStatus,
  reason: string,
): Promise<ActionState> {
  const auth = await checkPermission("digital_assets.update");
  if (!auth.ok) return { error: auth.error };
  if (!ASSET_STATUSES.includes(newStatus)) return { error: "Status inválido." };

  const existing = await db.query.digitalAssets.findFirst({ where: eq(digitalAssets.id, assetId) });
  if (!existing) return { error: "Ativo não encontrado." };
  if (existing.status === newStatus) return { error: "O ativo já está neste status." };

  await db
    .update(digitalAssets)
    .set({ status: newStatus, updatedById: auth.session.userId })
    .where(eq(digitalAssets.id, assetId));
  await db.insert(digitalAssetStatusHistory).values({
    assetId,
    oldStatus: existing.status,
    newStatus,
    reason: reason.trim() || null,
    changedById: auth.session.userId,
  });
  await db.insert(digitalAssetComments).values({
    assetId,
    authorId: auth.session.userId,
    type: "ALTERACAO_STATUS",
    content: `Status alterado de ${existing.status} para ${newStatus}${reason.trim() ? ` — ${reason.trim()}` : ""}`,
  });
  await writeAssetAudit({
    assetId,
    userId: auth.session.userId,
    action: "STATUS_CHANGED",
    metadata: { from: existing.status, to: newStatus, reason: reason.trim() || undefined },
  });
  if (existing.clientId) {
    await logActivity({
      userId: auth.session.userId,
      action: "asset.statusChanged",
      entityType: "client",
      entityId: existing.clientId,
      metadata: { title: existing.title, from: existing.status, to: newStatus },
    });
  }
  await runStatusAutomations(existing, newStatus, auth.session.userId);

  revalidateAsset(assetId, existing.clientId);
  return { success: "Status atualizado." };
}

export async function markAssetChecked(assetId: string, nextReviewDays: number): Promise<ActionState> {
  const auth = await checkPermission("digital_assets.update");
  if (!auth.ok) return { error: auth.error };
  const days = Number.isFinite(nextReviewDays) && nextReviewDays > 0 ? nextReviewDays : 30;
  const existing = await db.query.digitalAssets.findFirst({ where: eq(digitalAssets.id, assetId) });
  if (!existing) return { error: "Ativo não encontrado." };
  await db
    .update(digitalAssets)
    .set({
      lastCheckedAt: new Date(),
      nextReviewAt: new Date(Date.now() + days * 86400_000),
      updatedById: auth.session.userId,
    })
    .where(eq(digitalAssets.id, assetId));
  revalidateAsset(assetId, existing.clientId);
  return { success: `Checagem registrada. Próxima revisão em ${days} dias.` };
}

// ---------------------------------------------------------------------------
// Segredos (criptografados — revelação auditada)
// ---------------------------------------------------------------------------

const secretSchema = z.object({
  secretType: z.enum(SECRET_TYPES),
  label: z.string().trim().min(1, "Informe o rótulo"),
  value: z.string().min(1, "Informe o valor do segredo"),
});

export async function addSecret(
  assetId: string,
  secretType: string,
  label: string,
  value: string,
): Promise<ActionState> {
  const auth = await checkPermission("digital_assets.create_secrets");
  if (!auth.ok) return { error: auth.error };
  const parsed = secretSchema.safeParse({ secretType, label, value });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  const asset = await db.query.digitalAssets.findFirst({ where: eq(digitalAssets.id, assetId) });
  if (!asset) return { error: "Ativo não encontrado." };

  await db.insert(digitalAssetSecrets).values({
    assetId,
    secretType: parsed.data.secretType,
    label: parsed.data.label,
    encryptedValue: encryptSecret(parsed.data.value),
    maskedPreview: maskSecret(parsed.data.value),
    createdById: auth.session.userId,
  });
  await writeAssetAudit({
    assetId,
    userId: auth.session.userId,
    action: "SECRET_CREATED",
    metadata: { label: parsed.data.label, secretType: parsed.data.secretType },
  });
  if (asset.clientId) {
    await logActivity({
      userId: auth.session.userId,
      action: "asset.secretAdded",
      entityType: "client",
      entityId: asset.clientId,
      metadata: { title: asset.title },
    });
  }
  revalidateAsset(assetId, asset.clientId);
  return { success: "Segredo salvo criptografado." };
}

export async function updateSecret(
  secretId: string,
  label: string,
  value: string,
): Promise<ActionState> {
  const auth = await checkPermission("digital_assets.update_secrets");
  if (!auth.ok) return { error: auth.error };
  const secret = await db.query.digitalAssetSecrets.findFirst({
    where: eq(digitalAssetSecrets.id, secretId),
  });
  if (!secret) return { error: "Segredo não encontrado." };
  if (!label.trim()) return { error: "Informe o rótulo." };

  await db
    .update(digitalAssetSecrets)
    .set({
      label: label.trim(),
      ...(value
        ? { encryptedValue: encryptSecret(value), maskedPreview: maskSecret(value) }
        : {}),
      updatedById: auth.session.userId,
    })
    .where(eq(digitalAssetSecrets.id, secretId));
  await writeAssetAudit({
    assetId: secret.assetId,
    userId: auth.session.userId,
    action: "SECRET_UPDATED",
    metadata: { label: label.trim(), valueChanged: !!value },
  });
  revalidateAsset(secret.assetId);
  return { success: "Segredo atualizado." };
}

export async function deleteSecret(secretId: string): Promise<ActionState> {
  const auth = await checkPermission("digital_assets.delete_secrets");
  if (!auth.ok) return { error: auth.error };
  const secret = await db.query.digitalAssetSecrets.findFirst({
    where: eq(digitalAssetSecrets.id, secretId),
  });
  if (!secret) return { error: "Segredo não encontrado." };
  await db.delete(digitalAssetSecrets).where(eq(digitalAssetSecrets.id, secretId));
  await writeAssetAudit({
    assetId: secret.assetId,
    userId: auth.session.userId,
    action: "SECRET_DELETED",
    metadata: { label: secret.label },
  });
  revalidateAsset(secret.assetId);
  return { success: "Segredo removido." };
}

/**
 * Revela (ou copia) um segredo. ÚNICO caminho pelo qual o valor
 * descriptografado sai do servidor. Sempre auditado; negações também.
 */
export async function revealSecret(
  secretId: string,
  mode: "reveal" | "copy" = "reveal",
): Promise<{ error?: string; value?: string }> {
  const permission = mode === "copy" ? "digital_assets.copy_secrets" : "digital_assets.reveal_secrets";
  const auth = await checkPermission(permission);
  if (!auth.ok) {
    // tentativa negada envolvendo segredo → auditoria
    const secret = await db.query.digitalAssetSecrets.findFirst({
      where: eq(digitalAssetSecrets.id, secretId),
    });
    await writeAssetAudit({
      assetId: secret?.assetId,
      userId: null,
      action: "PERMISSION_DENIED",
      metadata: { secretId, mode, reason: "sem permissão" },
    });
    return { error: auth.error };
  }

  const secret = await db.query.digitalAssetSecrets.findFirst({
    where: eq(digitalAssetSecrets.id, secretId),
    with: { asset: true },
  });
  if (!secret) return { error: "Segredo não encontrado." };

  // SOCIAL_MEDIA não revela tokens/API keys/2FA
  const isPrivileged = auth.session.roles.some((r) =>
    ["OWNER", "ADMIN", "GESTOR_TRAFEGO"].includes(r),
  );
  if (
    !isPrivileged &&
    (RESTRICTED_SECRET_TYPES_FOR_SOCIAL as readonly string[]).includes(secret.secretType)
  ) {
    await writeAssetAudit({
      assetId: secret.assetId,
      userId: auth.session.userId,
      action: "PERMISSION_DENIED",
      metadata: { secretId, secretType: secret.secretType, reason: "tipo de segredo restrito para o papel" },
    });
    return { error: "Seu papel não pode revelar tokens, API keys ou segredos 2FA." };
  }

  let value: string;
  try {
    value = decryptSecret(secret.encryptedValue);
  } catch {
    return { error: "Falha ao descriptografar. A chave do cofre pode ter mudado." };
  }

  await db
    .update(digitalAssetSecrets)
    .set({ lastRevealedAt: new Date() })
    .where(eq(digitalAssetSecrets.id, secretId));

  const isCritical = ["TOKEN", "API_KEY", "TWO_FACTOR_SECRET"].includes(secret.secretType);
  await writeAssetAudit({
    assetId: secret.assetId,
    userId: auth.session.userId,
    action: mode === "copy" ? "SECRET_COPIED" : "SECRET_REVEALED",
    metadata: { label: secret.label, secretType: secret.secretType, critical: isCritical },
  });
  // segredo crítico revelado → notificar admins
  if (isCritical) {
    await notifyRole("ADMIN", {
      title: `${secret.secretType} revelado — ${secret.asset.title}`,
      body: `Por ${auth.session.name}. Veja a auditoria do ativo.`,
      type: "ALERTA",
      entityType: "digitalAsset",
      entityId: secret.assetId,
    });
  }

  return { value };
}

// ---------------------------------------------------------------------------
// Anexos (armazenados fora do repositório em apps/web/uploads)
// ---------------------------------------------------------------------------

export async function uploadAttachment(assetId: string, formData: FormData): Promise<ActionState> {
  const auth = await checkPermission("digital_assets.upload_attachments");
  if (!auth.ok) return { error: auth.error };

  // Vercel tem filesystem efêmero/somente-leitura — anexos precisam de storage
  // externo (Vercel Blob/S3). Evita crash confuso até isso ser configurado.
  if (process.env.VERCEL) {
    return {
      error:
        "Upload de anexos indisponível neste ambiente. Configure um storage externo (Vercel Blob/S3) — veja docs/DEPLOY.md.",
    };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Selecione um arquivo." };
  if (file.size > MAX_FILE_SIZE) return { error: "Arquivo muito grande (limite 25MB)." };

  const asset = await db.query.digitalAssets.findFirst({ where: eq(digitalAssets.id, assetId) });
  if (!asset) return { error: "Ativo não encontrado." };

  const safeName = file.name.replace(/[^\w.\-À-ú ]/g, "_").slice(0, 120);
  const storageName = `${crypto.randomUUID()}__${safeName}`;
  await mkdir(UPLOADS_DIR, { recursive: true });
  await writeFile(join(UPLOADS_DIR, storageName), Buffer.from(await file.arrayBuffer()));

  await db.insert(digitalAssetAttachments).values({
    assetId,
    fileName: safeName,
    fileType: file.type || null,
    fileSize: file.size,
    storagePath: storageName,
    uploadedById: auth.session.userId,
  });
  await writeAssetAudit({
    assetId,
    userId: auth.session.userId,
    action: "ATTACHMENT_UPLOADED",
    metadata: { fileName: safeName, fileSize: file.size },
  });

  revalidateAsset(assetId, asset.clientId);
  return { success: "Anexo enviado." };
}

export async function deleteAttachment(attachmentId: string): Promise<ActionState> {
  const auth = await checkPermission("digital_assets.delete");
  if (!auth.ok) return { error: auth.error };
  const attachment = await db.query.digitalAssetAttachments.findFirst({
    where: eq(digitalAssetAttachments.id, attachmentId),
  });
  if (!attachment) return { error: "Anexo não encontrado." };
  await db.delete(digitalAssetAttachments).where(eq(digitalAssetAttachments.id, attachmentId));
  try {
    await unlink(join(UPLOADS_DIR, attachment.storagePath));
  } catch {
    // arquivo já removido do disco — segue
  }
  await writeAssetAudit({
    assetId: attachment.assetId,
    userId: auth.session.userId,
    action: "ATTACHMENT_DELETED",
    metadata: { fileName: attachment.fileName },
  });
  revalidateAsset(attachment.assetId);
  return { success: "Anexo removido." };
}

// ---------------------------------------------------------------------------
// Comentários
// ---------------------------------------------------------------------------

export async function addAssetComment(
  assetId: string,
  content: string,
  type: string,
): Promise<ActionState> {
  const auth = await checkPermission("digital_assets.view");
  if (!auth.ok) return { error: auth.error };
  if (!content.trim()) return { error: "Comentário vazio." };
  const commentType = ASSET_COMMENT_TYPES.includes(type as never)
    ? (type as (typeof ASSET_COMMENT_TYPES)[number])
    : "COMENTARIO";

  await db.insert(digitalAssetComments).values({
    assetId,
    authorId: auth.session.userId,
    content: content.trim(),
    type: commentType,
  });
  revalidateAsset(assetId);
  return { success: "Comentário adicionado." };
}
