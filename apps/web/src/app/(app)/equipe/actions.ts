"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import {
  CARGO_NAMES,
  permissionAuditLogs,
  teamMembers,
  users,
  type PermissionAuditAction,
} from "@/db/schema";
import { userPermissions } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { checkPermission, isAdmin } from "@/lib/auth/guard";
import { isAdminGeral } from "@/lib/auth/access";
import type { SessionPayload } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import {
  ADMIN_ONLY_GRANT,
  cargoDefaultPermissions,
  CARGO_LABELS,
  isPermissionKey,
  type PermissionKey,
} from "@/lib/auth/permissions";
import { notifyUser } from "@/lib/notify";
import { buildStorageKey, getStorage, maxUploadBytes } from "@/lib/storage";
import { UPLOAD_WHITELISTS, validateUpload } from "@/lib/storage/validation";

export type ActionState = { error?: string; success?: string };

/**
 * Guarda do módulo Equipe: exige a permissão específica E ser Administrador
 * Geral. Dupla verificação — nenhuma action de equipe/acesso vaza para quem não
 * é Admin Geral, mesmo que uma permissão de team.* fosse concedida por engano.
 */
async function guardTeam(
  permission: PermissionKey,
): Promise<{ ok: true; session: SessionPayload } | { ok: false; error: string }> {
  const auth = await checkPermission(permission);
  if (!auth.ok) return auth;
  if (!isAdmin(auth.session)) {
    return { ok: false, error: "Apenas o Administrador Geral acessa o módulo Equipe." };
  }
  return auth;
}

// --------------------------------------------------------------------------
// Auditoria de acessos (imutável): concessão/remoção de extra e troca de cargo
// --------------------------------------------------------------------------

async function requestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
    return { ip, userAgent: h.get("user-agent") };
  } catch {
    return { ip: null, userAgent: null };
  }
}

async function writePermissionAudit(entry: {
  actorId: string;
  targetUserId: string;
  action: PermissionAuditAction;
  permission?: string;
  cargoBefore?: string | null;
  cargoAfter?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const meta = await requestMeta();
  await db.insert(permissionAuditLogs).values({
    actorId: entry.actorId,
    targetUserId: entry.targetUserId,
    action: entry.action,
    permission: entry.permission ?? null,
    cargoBefore: entry.cargoBefore ?? null,
    cargoAfter: entry.cargoAfter ?? null,
    metadata: entry.metadata,
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  });
}

/** Incrementa users.sessionVersion — invalida na hora as sessões abertas. */
async function revokeUserSessions(userId: string) {
  await db
    .update(users)
    .set({ sessionVersion: sql`${users.sessionVersion} + 1` })
    .where(eq(users.id, userId));
}

/** Quantos Administradores Gerais ativos existem (excluindo opcionalmente 1). */
async function countActiveAdmins(excludeUserId?: string): Promise<number> {
  const where = excludeUserId
    ? and(eq(users.cargo, "ADMINISTRADOR_GERAL"), eq(users.isActive, true), ne(users.id, excludeUserId))
    : and(eq(users.cargo, "ADMINISTRADOR_GERAL"), eq(users.isActive, true));
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(users).where(where);
  return n ?? 0;
}

const cargoSchema = z.enum(CARGO_NAMES);

const createMemberSchema = z.object({
  name: z.string().trim().min(2, "Nome muito curto"),
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  phone: z.string().trim().optional(),
  password: z.string().min(8, "Senha precisa de pelo menos 8 caracteres"),
  cargo: cargoSchema,
});

export async function createTeamMember(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await guardTeam("team.create");
  if (!auth.ok) return { error: auth.error };

  const parsed = createMemberSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
    password: formData.get("password"),
    cargo: formData.get("cargo"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const existing = await db.query.users.findFirst({ where: eq(users.email, parsed.data.email) });
  if (existing) return { error: "Já existe um usuário com este e-mail." };

  const [user] = await db
    .insert(users)
    .values({
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash: await hashPassword(parsed.data.password),
      status: "ATIVO",
      isActive: true,
      signupSource: "ADMIN",
      cargo: parsed.data.cargo,
      approvedById: auth.session.userId,
      approvedAt: new Date(),
    })
    .returning();

  await db.insert(teamMembers).values({ userId: user.id, phone: parsed.data.phone, status: "ATIVO" });

  await writePermissionAudit({
    actorId: auth.session.userId,
    targetUserId: user.id,
    action: "CARGO_CHANGED",
    cargoBefore: null,
    cargoAfter: parsed.data.cargo,
    metadata: { reason: "created", email: user.email },
  });
  await logActivity({
    userId: auth.session.userId,
    action: "team.memberCreated",
    entityType: "user",
    entityId: user.id,
    metadata: { email: user.email, cargo: parsed.data.cargo },
  });

  revalidatePath("/equipe");
  return { success: `${user.name} cadastrado(a) como ${CARGO_LABELS[parsed.data.cargo]}.` };
}

/** Aprova um cadastro pendente, definindo o cargo. */
export async function approveUser(userId: string, cargo: string): Promise<ActionState> {
  const auth = await guardTeam("team.approve");
  if (!auth.ok) return { error: auth.error };

  const parsed = cargoSchema.safeParse(cargo);
  if (!parsed.success) return { error: "Selecione um cargo válido." };

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return { error: "Usuário não encontrado." };
  if (user.status !== "PENDENTE") return { error: "Este cadastro não está pendente de aprovação." };

  await db
    .update(users)
    .set({
      status: "ATIVO",
      isActive: true,
      cargo: parsed.data,
      approvedById: auth.session.userId,
      approvedAt: new Date(),
      sessionVersion: sql`${users.sessionVersion} + 1`,
    })
    .where(eq(users.id, userId));

  const existingMember = await db.query.teamMembers.findFirst({ where: eq(teamMembers.userId, userId) });
  if (existingMember) {
    await db.update(teamMembers).set({ status: "ATIVO" }).where(eq(teamMembers.userId, userId));
  } else {
    await db.insert(teamMembers).values({ userId, status: "ATIVO" });
  }

  await writePermissionAudit({
    actorId: auth.session.userId,
    targetUserId: userId,
    action: "CARGO_CHANGED",
    cargoBefore: null,
    cargoAfter: parsed.data,
    metadata: { reason: "approved", email: user.email },
  });
  await logActivity({
    userId: auth.session.userId,
    action: "team.userApproved",
    entityType: "user",
    entityId: userId,
    metadata: { email: user.email, cargo: parsed.data },
  });
  await notifyUser(userId, {
    title: "Acesso aprovado 🎉",
    body: "Seu acesso ao COP B2C foi liberado. Você já pode entrar.",
    type: "SISTEMA",
  });

  revalidatePath("/equipe");
  return { success: `Acesso de ${user.email} aprovado.` };
}

export async function rejectUser(userId: string): Promise<ActionState> {
  const auth = await guardTeam("team.approve");
  if (!auth.ok) return { error: auth.error };

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return { error: "Usuário não encontrado." };
  if (user.status !== "PENDENTE") return { error: "Este cadastro não está pendente." };

  await db
    .update(users)
    .set({ status: "REJEITADO", isActive: false, sessionVersion: sql`${users.sessionVersion} + 1` })
    .where(eq(users.id, userId));

  await logActivity({
    userId: auth.session.userId,
    action: "team.userRejected",
    entityType: "user",
    entityId: userId,
    metadata: { email: user.email },
  });

  revalidatePath("/equipe");
  return { success: `Cadastro de ${user.email} recusado.` };
}

/** Altera o CARGO de um usuário. Só Administrador Geral; protege o último admin. */
export async function changeCargo(userId: string, cargo: string): Promise<ActionState> {
  const auth = await guardTeam("team.change_role");
  if (!auth.ok) return { error: auth.error };
  if (userId === auth.session.userId) {
    return { error: "Você não pode alterar o seu próprio cargo." };
  }

  const parsed = cargoSchema.safeParse(cargo);
  if (!parsed.success) return { error: "Selecione um cargo válido." };

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return { error: "Usuário não encontrado." };
  if (user.cargo === parsed.data) return { success: "Cargo mantido (sem alteração)." };

  // Não deixar o sistema sem nenhum Administrador Geral ativo
  if (user.cargo === "ADMINISTRADOR_GERAL" && parsed.data !== "ADMINISTRADOR_GERAL") {
    if ((await countActiveAdmins(userId)) === 0) {
      return { error: "Não é possível rebaixar o último Administrador Geral do sistema." };
    }
  }

  await db.update(users).set({ cargo: parsed.data }).where(eq(users.id, userId));
  await revokeUserSessions(userId);

  await writePermissionAudit({
    actorId: auth.session.userId,
    targetUserId: userId,
    action: "CARGO_CHANGED",
    cargoBefore: user.cargo,
    cargoAfter: parsed.data,
    metadata: { email: user.email },
  });
  await logActivity({
    userId: auth.session.userId,
    action: "team.cargoChanged",
    entityType: "user",
    entityId: userId,
    metadata: { email: user.email, from: user.cargo, to: parsed.data },
  });

  revalidatePath("/equipe");
  return { success: `Cargo alterado para ${CARGO_LABELS[parsed.data]}.` };
}

/** Concede uma permissão EXTRA (grant-only) a um usuário. Só Administrador Geral. */
export async function grantPermission(userId: string, permission: string): Promise<ActionState> {
  const auth = await guardTeam("team.grant_permissions");
  if (!auth.ok) return { error: auth.error };
  if (userId === auth.session.userId) {
    return { error: "Você não pode alterar as suas próprias permissões." };
  }
  if (!isPermissionKey(permission)) return { error: "Permissão desconhecida." };
  const key = permission as PermissionKey;

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return { error: "Usuário não encontrado." };

  // Teto de delegação: só o Administrador Geral concede as chaves sensíveis.
  // (guardTeam já exige Admin Geral; a checagem fica explícita para o futuro.)
  if (ADMIN_ONLY_GRANT.has(key) && !isAdminGeral(auth.session)) {
    return { error: "Esta permissão só pode ser concedida pelo Administrador Geral." };
  }
  // Já faz parte do pacote padrão do cargo → não precisa conceder.
  if (cargoDefaultPermissions(user.cargo).includes(key)) {
    return { error: "Esta permissão já vem do cargo — não precisa conceder." };
  }

  await db.insert(userPermissions).values({ userId, permission: key, grantedById: auth.session.userId }).onConflictDoNothing();
  await revokeUserSessions(userId);

  await writePermissionAudit({
    actorId: auth.session.userId,
    targetUserId: userId,
    action: "PERMISSION_GRANTED",
    permission: key,
    metadata: { email: user.email },
  });
  revalidatePath("/equipe");
  return { success: "Permissão concedida." };
}

/** Remove uma permissão EXTRA de um usuário (não afeta o pacote do cargo). */
export async function revokePermission(userId: string, permission: string): Promise<ActionState> {
  const auth = await guardTeam("team.grant_permissions");
  if (!auth.ok) return { error: auth.error };
  if (userId === auth.session.userId) {
    return { error: "Você não pode alterar as suas próprias permissões." };
  }
  if (!isPermissionKey(permission)) return { error: "Permissão desconhecida." };
  const key = permission as PermissionKey;

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return { error: "Usuário não encontrado." };

  await db
    .delete(userPermissions)
    .where(and(eq(userPermissions.userId, userId), eq(userPermissions.permission, key)));
  await revokeUserSessions(userId);

  await writePermissionAudit({
    actorId: auth.session.userId,
    targetUserId: userId,
    action: "PERMISSION_REVOKED",
    permission: key,
    metadata: { email: user.email },
  });
  revalidatePath("/equipe");
  return { success: "Permissão removida." };
}

const profileSchema = z.object({
  name: z.string().trim().min(2, "Nome muito curto"),
  phone: z.string().trim().optional(),
});

/** Edita nome e telefone do colaborador. */
export async function updateMemberProfile(
  userId: string,
  input: { name: string; phone?: string },
): Promise<ActionState> {
  const auth = await guardTeam("team.update");
  if (!auth.ok) return { error: auth.error };
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const d = parsed.data;

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return { error: "Usuário não encontrado." };

  await db.update(users).set({ name: d.name }).where(eq(users.id, userId));
  const member = await db.query.teamMembers.findFirst({ where: eq(teamMembers.userId, userId) });
  if (member) {
    await db.update(teamMembers).set({ phone: d.phone ?? null }).where(eq(teamMembers.userId, userId));
  } else {
    await db.insert(teamMembers).values({ userId, phone: d.phone, status: "ATIVO" });
  }

  await logActivity({
    userId: auth.session.userId,
    action: "team.profileUpdated",
    entityType: "user",
    entityId: userId,
    metadata: { name: d.name },
  });
  revalidatePath("/equipe");
  return { success: "Dados do colaborador atualizados." };
}

/**
 * Exclui um colaborador de forma definitiva e segura. Antes de remover, anula
 * as referências (autoria/atribuição) que apontam para o usuário e cujo FK é
 * restritivo. Tudo em transação.
 */
export async function deleteTeamMember(userId: string): Promise<ActionState> {
  const auth = await guardTeam("team.delete");
  if (!auth.ok) return { error: auth.error };
  if (userId === auth.session.userId) return { error: "Você não pode excluir a si mesmo." };

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return { error: "Usuário não encontrado." };

  // Nunca deixar o sistema sem nenhum Administrador Geral ativo
  if (user.cargo === "ADMINISTRADOR_GERAL" && (await countActiveAdmins(userId)) === 0) {
    return { error: "Não é possível excluir o último Administrador Geral do sistema." };
  }

  try {
    await db.transaction(async (tx) => {
      const fks = (await tx.execute(sql`
        SELECT tc.table_name, kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
        JOIN information_schema.referential_constraints rc
          ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND ccu.table_name = 'users' AND ccu.column_name = 'id'
          AND rc.delete_rule <> 'CASCADE'
      `)) as unknown as { table_name: string; column_name: string }[];
      const rows = Array.isArray(fks) ? fks : ((fks as { rows?: unknown[] }).rows ?? []);
      for (const r of rows as { table_name: string; column_name: string }[]) {
        await tx.execute(
          sql`UPDATE ${sql.identifier(r.table_name)} SET ${sql.identifier(r.column_name)} = NULL WHERE ${sql.identifier(r.column_name)} = ${userId}`,
        );
      }
      await tx.delete(users).where(eq(users.id, userId));
    });
  } catch {
    return {
      error:
        "Não foi possível excluir este colaborador com segurança. Como alternativa, desative o acesso dele.",
    };
  }

  await logActivity({
    userId: auth.session.userId,
    action: "team.memberDeleted",
    entityType: "user",
    entityId: userId,
    metadata: { email: user.email, name: user.name, cargo: user.cargo },
  });
  revalidatePath("/equipe");
  return { success: `${user.name} foi excluído(a) do sistema.` };
}

/**
 * Envia (ou substitui) a foto de perfil do colaborador. Valida por conteúdo
 * (magic bytes) e grava a KEY em users.avatar_url.
 */
export async function uploadMemberAvatar(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await guardTeam("team.update");
  if (!auth.ok) return { error: auth.error };

  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "Colaborador não informado." };
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return { error: "Usuário não encontrado." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Selecione uma imagem." };

  const buffer = Buffer.from(await file.arrayBuffer());
  const valid = await validateUpload({
    buffer,
    fileName: file.name,
    allowed: UPLOAD_WHITELISTS.avatars,
    maxBytes: maxUploadBytes(),
  });
  if (!valid.ok) return { error: valid.error };

  const { key: path } = buildStorageKey("avatars", file.name);
  // Grava a chave RETORNADA pelo storage, não o path de entrada: no Vercel Blob
  // a chave real é a URL (com sufixo aleatório) — guardar o path de entrada
  // deixava o arquivo irrecuperável (bug que órfãos todos os uploads em prod).
  const stored = await getStorage().upload({ path, body: buffer, contentType: valid.mime });

  const previousKey = user.avatarUrl;
  await db.update(users).set({ avatarUrl: stored.key }).where(eq(users.id, userId));
  if (previousKey && previousKey !== stored.key) {
    try {
      await getStorage().delete(previousKey);
    } catch {
      /* arquivo antigo já removido */
    }
  }

  await logActivity({
    userId: auth.session.userId,
    action: "team.avatarUpdated",
    entityType: "user",
    entityId: userId,
    metadata: { email: user.email },
  });
  revalidatePath("/equipe");
  return { success: "Foto atualizada." };
}

/** Remove a foto de perfil do colaborador (volta às iniciais). */
export async function removeMemberAvatar(userId: string): Promise<ActionState> {
  const auth = await guardTeam("team.update");
  if (!auth.ok) return { error: auth.error };

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return { error: "Usuário não encontrado." };
  if (!user.avatarUrl) return { success: "Sem foto para remover." };

  const key = user.avatarUrl;
  await db.update(users).set({ avatarUrl: null }).where(eq(users.id, userId));
  try {
    await getStorage().delete(key);
  } catch {
    /* arquivo já removido */
  }

  await logActivity({
    userId: auth.session.userId,
    action: "team.avatarRemoved",
    entityType: "user",
    entityId: userId,
    metadata: { email: user.email },
  });
  revalidatePath("/equipe");
  return { success: "Foto removida." };
}

export async function toggleMemberActive(userId: string): Promise<ActionState> {
  const auth = await guardTeam("team.deactivate");
  if (!auth.ok) return { error: auth.error };

  if (userId === auth.session.userId) {
    return { error: "Você não pode desativar a si mesmo." };
  }

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return { error: "Usuário não encontrado." };
  if (user.status === "PENDENTE" || user.status === "REJEITADO") {
    return { error: "Aprove ou recuse este cadastro antes de ativar/desativar." };
  }

  const newActive = !user.isActive;
  // Não desativar o último Administrador Geral ativo
  if (!newActive && user.cargo === "ADMINISTRADOR_GERAL" && (await countActiveAdmins(userId)) === 0) {
    return { error: "Não é possível desativar o último Administrador Geral do sistema." };
  }

  await db
    .update(users)
    .set({
      isActive: newActive,
      status: newActive ? "ATIVO" : "INATIVO",
      sessionVersion: sql`${users.sessionVersion} + 1`,
    })
    .where(eq(users.id, userId));
  await db
    .update(teamMembers)
    .set({ status: newActive ? "ATIVO" : "INATIVO" })
    .where(eq(teamMembers.userId, userId));

  await logActivity({
    userId: auth.session.userId,
    action: newActive ? "team.memberActivated" : "team.memberDeactivated",
    entityType: "user",
    entityId: userId,
    metadata: { email: user.email },
  });

  revalidatePath("/equipe");
  return { success: newActive ? "Colaborador reativado." : "Colaborador desativado." };
}
