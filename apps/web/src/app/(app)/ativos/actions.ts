"use server";

import { eq, inArray } from "drizzle-orm";
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
import { writeAssetAudit, writeAssetAuditBatchStrict, writeAssetAuditStrict } from "@/lib/assets/audit";
import { checkPermission } from "@/lib/auth/guard";
import { canAccessAsset, canAccessClient, partitionAssetsByAccess } from "@/lib/auth/ownership";
import type { SessionPayload } from "@/lib/auth/session";
import { RESTRICTED_SECRET_TYPES_FOR_SOCIAL, roleHasPermission } from "@/lib/auth/permissions";
import { isValidOptionValue, resolveDefaultValue } from "@/lib/config-options";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { notifyRole, notifyUser } from "@/lib/notify";
import { buildStorageKey, getStorage, maxUploadBytes } from "@/lib/storage";
import { UPLOAD_WHITELISTS, validateUpload } from "@/lib/storage/validation";

export type ActionState = { error?: string; success?: string; assetId?: string };

/** Status válido = enum do sistema OU coluna criada pelo admin no Kanban de ativos. */
async function isValidAssetStatus(status: string): Promise<boolean> {
  if ((ASSET_STATUSES as readonly string[]).includes(status)) return true;
  return isValidOptionValue("digital_assets", "status", status);
}

function revalidateAsset(assetId?: string, clientId?: string | null) {
  revalidatePath("/ativos");
  if (assetId) revalidatePath(`/ativos/${assetId}`);
  if (clientId) revalidatePath(`/clientes/${clientId}`);
}

/**
 * Gate de ownership: além da permissão RBAC, escrever/revelar exige ser
 * responsável pelo cliente do ativo (OWNER/ADMIN operam tudo; ativos internos
 * exigem GESTOR_OPERACIONAL). Negações são auditadas.
 */
async function denyOutOfScope(
  session: SessionPayload,
  assetId: string,
  context: Record<string, unknown> = {},
): Promise<ActionState | null> {
  if (await canAccessAsset(session, assetId)) return null;
  await writeAssetAudit({
    assetId,
    userId: session.userId,
    action: "PERMISSION_DENIED",
    metadata: { ...context, reason: "ownership_scope" },
  });
  return { error: "Você não é responsável por este ativo/cliente." };
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

  // criar ativo para um cliente exige ser responsável por esse cliente
  if (parsed.data.clientId && !(await canAccessClient(auth.session, parsed.data.clientId))) {
    await writeAssetAudit({
      userId: auth.session.userId,
      action: "PERMISSION_DENIED",
      metadata: { action: "createAsset", clientId: parsed.data.clientId, reason: "ownership_scope" },
    });
    return { error: "Você não é responsável por este cliente." };
  }

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
    // secretId gerado ANTES para entrar no AAD do GCM (vincula ciphertext ao registro)
    const secretId = crypto.randomUUID();
    await db.insert(digitalAssetSecrets).values({
      id: secretId,
      assetId: asset.id,
      secretType,
      label: labelParts.join("__") || secretType,
      encryptedValue: encryptSecret(value, { secretId, assetId: asset.id }),
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

  const denied = await denyOutOfScope(auth.session, assetId, { action: "updateAsset" });
  if (denied) return denied;

  // mover o ativo para um cliente fora do seu escopo é bloqueado (como no create)
  if (
    parsed.data.clientId &&
    parsed.data.clientId !== existing.clientId &&
    !(await canAccessClient(auth.session, parsed.data.clientId))
  ) {
    await writeAssetAudit({
      assetId,
      userId: auth.session.userId,
      action: "PERMISSION_DENIED",
      metadata: { action: "updateAsset", clientId: parsed.data.clientId, reason: "ownership_scope" },
    });
    return { error: "Você não é responsável por este cliente." };
  }

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

  const denied = await denyOutOfScope(auth.session, assetId, { action: "archiveAsset" });
  if (denied) return denied;

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

  const denied = await denyOutOfScope(auth.session, assetId, { action: "duplicateAsset" });
  if (denied) return denied;

  // valida a permissão de segredos ANTES de inserir a cópia (senão sobra ativo órfão)
  if (copySecrets && !roleHasPermission(auth.session.roles, "digital_assets.create_secrets")) {
    return { error: "Você não tem permissão para copiar segredos." };
  }

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
    for (const s of secrets) {
      // O AAD vincula o ciphertext ao (secretId, assetId) de origem — para
      // copiar é preciso decriptar e recriptar com o contexto do novo registro.
      // O plaintext nunca sai do servidor.
      let plain: string;
      try {
        plain = decryptSecret(s.encryptedValue, { secretId: s.id, assetId });
      } catch {
        continue; // segredo ilegível (chave antiga/adulterado) — não copia
      }
      const newSecretId = crypto.randomUUID();
      await db.insert(digitalAssetSecrets).values({
        id: newSecretId,
        assetId: copy.id,
        secretType: s.secretType,
        label: s.label,
        encryptedValue: encryptSecret(plain, { secretId: newSecretId, assetId: copy.id }),
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

export type StatusChangeResult = ActionState & { requires?: "BLOQUEADA" };

export async function changeAssetStatus(
  assetId: string,
  newStatus: string,
  reason: string,
  extras?: { nextReviewDays?: number },
): Promise<StatusChangeResult> {
  const auth = await checkPermission("digital_assets.update");
  if (!auth.ok) return { error: auth.error };
  if (!(await isValidAssetStatus(newStatus))) return { error: "Status inválido." };

  const existing = await db.query.digitalAssets.findFirst({ where: eq(digitalAssets.id, assetId) });
  if (!existing) return { error: "Ativo não encontrado." };
  if (existing.status === newStatus) return { error: "O ativo já está neste status." };

  const denied = await denyOutOfScope(auth.session, assetId, { action: "changeAssetStatus" });
  if (denied) return denied;

  // Regra: bloquear exige motivo (registrado no histórico + comentário)
  if (newStatus === "BLOQUEADA" && reason.trim().length < 3) {
    return { requires: "BLOQUEADA", error: "Marcar como BLOQUEADA exige um motivo (mínimo 3 caracteres)." };
  }

  // Regra: ao esquentar, definir próxima revisão (padrão 7 dias se não informado)
  const set: Partial<typeof digitalAssets.$inferInsert> = {
    status: newStatus as AssetStatus,
    updatedById: auth.session.userId,
  };
  if (newStatus === "SENDO_ESQUENTADA") {
    const days = extras?.nextReviewDays && extras.nextReviewDays > 0 ? extras.nextReviewDays : 7;
    set.nextReviewAt = new Date(Date.now() + days * 86400_000);
  }

  await db.update(digitalAssets).set(set).where(eq(digitalAssets.id, assetId));
  await db.insert(digitalAssetStatusHistory).values({
    assetId,
    oldStatus: existing.status,
    newStatus: newStatus as AssetStatus,
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
  // automações só disparam para status conhecidos do sistema
  if ((ASSET_STATUSES as readonly string[]).includes(newStatus)) {
    await runStatusAutomations(existing, newStatus as AssetStatus, auth.session.userId);
  }

  revalidateAsset(assetId, existing.clientId);
  return { success: "Status atualizado." };
}

/** Criação rápida direto de uma coluna do Kanban (por status ou por grupo). */
export async function quickCreateAsset(
  title: string,
  opts: { status?: string; groupId?: string; clientId?: string | null },
): Promise<ActionState> {
  const auth = await checkPermission("digital_assets.create");
  if (!auth.ok) return { error: auth.error };
  const clean = title.trim();
  if (clean.length < 2) return { error: "Título muito curto." };

  // criar ativo para um cliente exige ser responsável por esse cliente
  if (opts.clientId && !(await canAccessClient(auth.session, opts.clientId))) {
    await writeAssetAudit({
      userId: auth.session.userId,
      action: "PERMISSION_DENIED",
      metadata: { action: "quickCreateAsset", clientId: opts.clientId, reason: "ownership_scope" },
    });
    return { error: "Você não é responsável por este cliente." };
  }

  // grupo: informado, ou o primeiro ativo (todo ativo precisa de um grupo)
  let groupId = opts.groupId;
  if (!groupId) {
    const first = await db.query.digitalAssetGroups.findFirst({
      where: eq(digitalAssetGroups.status, "ATIVO"),
      orderBy: (g, { asc }) => [asc(g.order), asc(g.name)],
    });
    if (!first) return { error: "Crie um grupo de ativos antes de adicionar pelo Kanban." };
    groupId = first.id;
  }

  const status = opts.status || (await resolveDefaultValue("digital_assets", "status", "NAO_INFORMADO"));
  if (!(await isValidAssetStatus(status))) return { error: "Status inválido." };

  const [asset] = await db
    .insert(digitalAssets)
    .values({
      groupId,
      clientId: opts.clientId || null,
      title: clean,
      status: status as AssetStatus,
      createdById: auth.session.userId,
      updatedById: auth.session.userId,
    })
    .returning();

  await writeAssetAudit({
    assetId: asset.id,
    userId: auth.session.userId,
    action: "ASSET_CREATED",
    metadata: { title: asset.title, quick: true },
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

/** Move um ativo entre grupos (Kanban agrupado por grupo). */
export async function moveAssetToGroup(assetId: string, groupId: string): Promise<ActionState> {
  const auth = await checkPermission("digital_assets.update");
  if (!auth.ok) return { error: auth.error };
  const [asset, group] = await Promise.all([
    db.query.digitalAssets.findFirst({ where: eq(digitalAssets.id, assetId) }),
    db.query.digitalAssetGroups.findFirst({ where: eq(digitalAssetGroups.id, groupId) }),
  ]);
  if (!asset) return { error: "Ativo não encontrado." };
  if (!group) return { error: "Grupo não encontrado." };
  if (asset.groupId === groupId) return { success: "O ativo já está neste grupo." };

  const denied = await denyOutOfScope(auth.session, assetId, { action: "moveAssetToGroup" });
  if (denied) return denied;

  await db
    .update(digitalAssets)
    .set({ groupId, updatedById: auth.session.userId })
    .where(eq(digitalAssets.id, assetId));
  await writeAssetAudit({
    assetId,
    userId: auth.session.userId,
    action: "ASSET_UPDATED",
    metadata: { movedToGroup: group.name },
  });
  revalidateAsset(assetId, asset.clientId);
  return { success: "Ativo movido de grupo." };
}

export async function markAssetChecked(assetId: string, nextReviewDays: number): Promise<ActionState> {
  const auth = await checkPermission("digital_assets.update");
  if (!auth.ok) return { error: auth.error };
  const days = Number.isFinite(nextReviewDays) && nextReviewDays > 0 ? nextReviewDays : 30;
  const existing = await db.query.digitalAssets.findFirst({ where: eq(digitalAssets.id, assetId) });
  if (!existing) return { error: "Ativo não encontrado." };
  const denied = await denyOutOfScope(auth.session, assetId, { action: "markAssetChecked" });
  if (denied) return denied;
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

  const denied = await denyOutOfScope(auth.session, assetId, { action: "addSecret" });
  if (denied) return denied;

  // secretId gerado ANTES para entrar no AAD do GCM (vincula ciphertext ao registro)
  const secretId = crypto.randomUUID();
  await db.insert(digitalAssetSecrets).values({
    id: secretId,
    assetId,
    secretType: parsed.data.secretType,
    label: parsed.data.label,
    encryptedValue: encryptSecret(parsed.data.value, { secretId, assetId }),
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

  const denied = await denyOutOfScope(auth.session, secret.assetId, {
    action: "updateSecret",
    secretId,
  });
  if (denied) return denied;

  await db
    .update(digitalAssetSecrets)
    .set({
      label: label.trim(),
      ...(value
        ? { encryptedValue: encryptSecret(value, { secretId, assetId: secret.assetId }) }
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

  const denied = await denyOutOfScope(auth.session, secret.assetId, {
    action: "deleteSecret",
    secretId,
  });
  if (denied) return denied;

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

  // escopo de ownership: só responsáveis pelo cliente do ativo revelam segredos
  const denied = await denyOutOfScope(auth.session, secret.assetId, {
    action: "revealSecret",
    secretId,
    mode,
  });
  if (denied) return { error: denied.error };

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
    value = decryptSecret(secret.encryptedValue, { secretId: secret.id, assetId: secret.assetId });
  } catch {
    // chave trocada, payload adulterado OU ciphertext trocado entre registros (AAD)
    return { error: "Falha ao descriptografar. A chave do cofre pode ter mudado." };
  }

  // Auditoria TRANSACIONAL com a ação sensível: se o registro de auditoria
  // falhar, a transação reverte e o plaintext NÃO é retornado (fail-closed).
  const isCritical = ["TOKEN", "API_KEY", "TWO_FACTOR_SECRET"].includes(secret.secretType);
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(digitalAssetSecrets)
        .set({ lastRevealedAt: new Date() })
        .where(eq(digitalAssetSecrets.id, secretId));
      await writeAssetAuditStrict(
        {
          assetId: secret.assetId,
          userId: auth.session.userId,
          action: mode === "copy" ? "SECRET_COPIED" : "SECRET_REVEALED",
          metadata: { label: secret.label, secretType: secret.secretType, critical: isCritical },
        },
        tx,
      );
    });
  } catch {
    return { error: "Não foi possível registrar a auditoria — revelação bloqueada." };
  }
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

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Selecione um arquivo." };

  const asset = await db.query.digitalAssets.findFirst({ where: eq(digitalAssets.id, assetId) });
  if (!asset) return { error: "Ativo não encontrado." };

  const denied = await denyOutOfScope(auth.session, assetId, { action: "uploadAttachment" });
  if (denied) return denied;

  // valida por conteúdo (magic bytes), não por extensão/Content-Type declarados
  const buffer = Buffer.from(await file.arrayBuffer());
  const valid = await validateUpload({
    buffer,
    fileName: file.name,
    allowed: UPLOAD_WHITELISTS.ativos,
    maxBytes: maxUploadBytes(),
  });
  if (!valid.ok) return { error: valid.error };

  const { key, safeName } = buildStorageKey("ativos", file.name);
  await getStorage().upload({ path: key, body: buffer, contentType: valid.mime });

  await db.insert(digitalAssetAttachments).values({
    assetId,
    fileName: safeName,
    fileType: valid.mime,
    fileSize: file.size,
    storagePath: key,
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

  const denied = await denyOutOfScope(auth.session, attachment.assetId, {
    action: "deleteAttachment",
    attachmentId,
  });
  if (denied) return denied;

  await db.delete(digitalAssetAttachments).where(eq(digitalAssetAttachments.id, attachmentId));
  try {
    await getStorage().delete(attachment.storagePath);
  } catch {
    // arquivo já removido do storage — segue
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

  const denied = await denyOutOfScope(auth.session, assetId, { action: "addAssetComment" });
  if (denied) return denied;
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

// ---------------------------------------------------------------------------
// Exclusão e ações em massa de ativos (seleção no Kanban/Lista)
// ---------------------------------------------------------------------------

export type BulkResult = { ok: number; fail: number; error?: string; success?: string };

/** Exclui um ativo definitivamente. Filhos (segredos, anexos, comentários,
 *  histórico, auditoria) saem por CASCADE. Guardado por digital_assets.delete. */
export async function deleteAsset(assetId: string): Promise<ActionState> {
  const auth = await checkPermission("digital_assets.delete");
  if (!auth.ok) return { error: auth.error };
  const asset = await db.query.digitalAssets.findFirst({ where: eq(digitalAssets.id, assetId) });
  if (!asset) return { error: "Ativo não encontrado." };
  const denied = await denyOutOfScope(auth.session, assetId, { action: "deleteAsset" });
  if (denied) return denied;
  // A auditoria do ativo tem FK CASCADE — sai junto. Registro em ActivityLog.
  await db.delete(digitalAssets).where(eq(digitalAssets.id, assetId));
  await logActivity({
    userId: auth.session.userId,
    action: "asset.deleted",
    entityType: "digitalAsset",
    entityId: assetId,
    metadata: { title: asset.title },
  });
  revalidateAsset(undefined, asset.clientId);
  return { success: "Ativo excluído." };
}

/**
 * Valida o lote inteiro: ownership em UMA query. Se qualquer item estiver
 * fora do escopo, a operação inteira falha listando os IDs negados (nada é
 * pulado em silêncio) e a negação é auditada.
 */
async function guardBulkScope(
  session: SessionPayload,
  ids: string[],
  action: string,
): Promise<{ allowed: string[] } | { error: string }> {
  const { allowed, denied } = await partitionAssetsByAccess(session, ids);
  if (denied.length) {
    await writeAssetAudit({
      userId: session.userId,
      action: "PERMISSION_DENIED",
      metadata: { action, deniedIds: denied, reason: "ownership_scope" },
    });
    return {
      error: `Operação cancelada: você não é responsável por ${denied.length} ativo(s) do lote (${denied.join(", ")}).`,
    };
  }
  if (!allowed.length) return { error: "Nenhum ativo válido na seleção." };
  return { allowed };
}

export async function bulkDeleteAssets(ids: string[]): Promise<BulkResult> {
  const auth = await checkPermission("digital_assets.delete");
  if (!auth.ok) return { ok: 0, fail: 0, error: auth.error };

  const scope = await guardBulkScope(auth.session, ids, "bulkDeleteAssets");
  if ("error" in scope) return { ok: 0, fail: ids.length, error: scope.error };

  await db.delete(digitalAssets).where(inArray(digitalAssets.id, scope.allowed));
  await logActivity({
    userId: auth.session.userId,
    action: "asset.bulkDeleted",
    entityType: "digitalAsset",
    metadata: { count: scope.allowed.length },
  });
  revalidatePath("/ativos");
  return {
    ok: scope.allowed.length,
    fail: ids.length - scope.allowed.length,
    success: `${scope.allowed.length} ativo(s) excluído(s).`,
  };
}

/** Move vários ativos para um status — um UPDATE + INSERTs multi-valores. */
export async function bulkMoveAssets(ids: string[], status: string): Promise<BulkResult> {
  const auth = await checkPermission("digital_assets.update");
  if (!auth.ok) return { ok: 0, fail: 0, error: auth.error };
  if (!(await isValidAssetStatus(status))) return { ok: 0, fail: ids.length, error: "Status inválido." };

  const scope = await guardBulkScope(auth.session, ids, "bulkMoveAssets");
  if ("error" in scope) return { ok: 0, fail: ids.length, error: scope.error };

  const rows = await db.query.digitalAssets.findMany({
    where: inArray(digitalAssets.id, scope.allowed),
    columns: { id: true, title: true, status: true, clientId: true, assignedToId: true },
  });
  const toChange = rows.filter((r) => r.status !== status);
  if (!toChange.length) {
    return { ok: 0, fail: ids.length, error: "Os ativos selecionados já estão neste status." };
  }

  const reason = "Alteração em massa";
  const set: Partial<typeof digitalAssets.$inferInsert> = {
    status: status as AssetStatus,
    updatedById: auth.session.userId,
  };
  if (status === "SENDO_ESQUENTADA") set.nextReviewAt = new Date(Date.now() + 7 * 86400_000);

  // old→new coletados em memória; histórico/comentários/auditoria em INSERTs multi
  await db.transaction(async (tx) => {
    const changedIds = toChange.map((r) => r.id);
    await tx.update(digitalAssets).set(set).where(inArray(digitalAssets.id, changedIds));
    await tx.insert(digitalAssetStatusHistory).values(
      toChange.map((r) => ({
        assetId: r.id,
        oldStatus: r.status,
        newStatus: status as AssetStatus,
        reason,
        changedById: auth.session.userId,
      })),
    );
    await tx.insert(digitalAssetComments).values(
      toChange.map((r) => ({
        assetId: r.id,
        authorId: auth.session.userId,
        type: "ALTERACAO_STATUS" as const,
        content: `Status alterado de ${r.status} para ${status} — ${reason}`,
      })),
    );
    await writeAssetAuditBatchStrict(
      toChange.map((r) => ({
        assetId: r.id,
        userId: auth.session.userId,
        action: "STATUS_CHANGED" as const,
        metadata: { from: r.status, to: status, reason, bulk: true },
      })),
      tx,
    );
  });

  // automações de status (notificações/tarefas) só para status conhecidos do sistema
  if ((ASSET_STATUSES as readonly string[]).includes(status)) {
    for (const r of toChange) {
      await runStatusAutomations(r, status as AssetStatus, auth.session.userId);
    }
  }

  revalidatePath("/ativos");
  return {
    ok: toChange.length,
    fail: ids.length - toChange.length,
    success: `${toChange.length} ativo(s) movido(s).`,
  };
}

/** Edição em massa: define responsável dos ativos selecionados — um UPDATE. */
export async function bulkAssignAssets(ids: string[], userId: string | null): Promise<BulkResult> {
  const auth = await checkPermission("digital_assets.update");
  if (!auth.ok) return { ok: 0, fail: 0, error: auth.error };

  const scope = await guardBulkScope(auth.session, ids, "bulkAssignAssets");
  if ("error" in scope) return { ok: 0, fail: ids.length, error: scope.error };

  await db
    .update(digitalAssets)
    .set({ assignedToId: userId || null, updatedById: auth.session.userId })
    .where(inArray(digitalAssets.id, scope.allowed));
  await logActivity({
    userId: auth.session.userId,
    action: "asset.bulkAssigned",
    entityType: "digitalAsset",
    metadata: { count: scope.allowed.length },
  });
  revalidatePath("/ativos");
  return {
    ok: scope.allowed.length,
    fail: ids.length - scope.allowed.length,
    success: `${scope.allowed.length} ativo(s) atualizado(s).`,
  };
}
