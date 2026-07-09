"use server";

import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { ROLE_NAMES, roles, teamMembers, userRoles, users } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { checkPermission, isAdmin } from "@/lib/auth/guard";
import type { SessionPayload } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { PRIVILEGED_ROLES, type PermissionKey } from "@/lib/auth/permissions";
import { notifyUser } from "@/lib/notify";

export type ActionState = { error?: string; success?: string };

/**
 * Guarda do módulo Equipe: exige a permissão específica E papel administrativo
 * (OWNER/ADMIN). Dupla verificação no backend — nenhuma action vaza dados de
 * equipe para papéis não administrativos, mesmo que uma permissão seja concedida
 * por engano a outro papel.
 */
async function guardTeam(
  permission: PermissionKey,
): Promise<{ ok: true; session: SessionPayload } | { ok: false; error: string }> {
  const auth = await checkPermission(permission);
  if (!auth.ok) return auth;
  if (!isAdmin(auth.session)) {
    return { ok: false, error: "Apenas OWNER/ADMIN acessam o módulo Equipe." };
  }
  return auth;
}

const createMemberSchema = z.object({
  name: z.string().trim().min(2, "Nome muito curto"),
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  phone: z.string().trim().optional(),
  position: z.string().trim().optional(),
  password: z.string().min(8, "Senha precisa de pelo menos 8 caracteres"),
  roles: z.array(z.enum(ROLE_NAMES)).min(1, "Selecione pelo menos um papel"),
});

/** Só OWNER/ADMIN podem conceder papéis administrativos (OWNER/ADMIN). */
function ensureCanGrantRoles(
  sessionRoles: readonly string[],
  targetRoles: string[],
): string | null {
  const grantingPrivileged = targetRoles.some((r) => PRIVILEGED_ROLES.includes(r as never));
  if (!grantingPrivileged) return null;
  const isOwnerAdmin = sessionRoles.some((r) => r === "OWNER" || r === "ADMIN");
  return isOwnerAdmin ? null : "Apenas OWNER/ADMIN podem conceder papéis administrativos.";
}

async function setUserRoles(userId: string, roleNames: string[]) {
  const roleRows = await db
    .select()
    .from(roles)
    .where(inArray(roles.name, roleNames as never));
  await db.delete(userRoles).where(eq(userRoles.userId, userId));
  if (roleRows.length) {
    await db.insert(userRoles).values(roleRows.map((r) => ({ userId, roleId: r.id })));
  }
}

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
    position: formData.get("position") || undefined,
    password: formData.get("password"),
    roles: formData.getAll("roles"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const grantError = ensureCanGrantRoles(auth.session.roles, parsed.data.roles);
  if (grantError) return { error: grantError };

  const existing = await db.query.users.findFirst({
    where: eq(users.email, parsed.data.email),
  });
  if (existing) return { error: "Já existe um usuário com este e-mail." };

  const [user] = await db
    .insert(users)
    .values({
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash: hashPassword(parsed.data.password),
      status: "ATIVO",
      isActive: true,
      signupSource: "ADMIN",
      approvedById: auth.session.userId,
      approvedAt: new Date(),
    })
    .returning();

  await setUserRoles(user.id, parsed.data.roles);
  await db.insert(teamMembers).values({
    userId: user.id,
    phone: parsed.data.phone,
    position: parsed.data.position,
    status: "ATIVO",
  });

  await logActivity({
    userId: auth.session.userId,
    action: "team.memberCreated",
    entityType: "user",
    entityId: user.id,
    metadata: { email: user.email, roles: parsed.data.roles },
  });

  revalidatePath("/equipe");
  return { success: `${user.name} cadastrado(a) com sucesso.` };
}

const roleListSchema = z.array(z.enum(ROLE_NAMES)).min(1, "Selecione pelo menos um papel");

/** Aprova um cadastro pendente, definindo o nível de acesso (papéis). */
export async function approveUser(userId: string, roleNames: string[]): Promise<ActionState> {
  const auth = await guardTeam("team.approve");
  if (!auth.ok) return { error: auth.error };

  const parsed = roleListSchema.safeParse(roleNames);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Selecione o nível de acesso." };

  const grantError = ensureCanGrantRoles(auth.session.roles, parsed.data);
  if (grantError) return { error: grantError };

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return { error: "Usuário não encontrado." };
  if (user.status !== "PENDENTE") return { error: "Este cadastro não está pendente de aprovação." };

  await setUserRoles(userId, parsed.data);
  await db
    .update(users)
    .set({ status: "ATIVO", isActive: true, approvedById: auth.session.userId, approvedAt: new Date() })
    .where(eq(users.id, userId));

  const existingMember = await db.query.teamMembers.findFirst({
    where: eq(teamMembers.userId, userId),
  });
  if (existingMember) {
    await db.update(teamMembers).set({ status: "ATIVO" }).where(eq(teamMembers.userId, userId));
  } else {
    await db.insert(teamMembers).values({ userId, status: "ATIVO" });
  }

  await logActivity({
    userId: auth.session.userId,
    action: "team.userApproved",
    entityType: "user",
    entityId: userId,
    metadata: { email: user.email, roles: parsed.data },
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
    .set({ status: "REJEITADO", isActive: false })
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

/** Atualiza o nível de acesso (papéis) de um usuário já existente. */
export async function updateUserRoles(userId: string, roleNames: string[]): Promise<ActionState> {
  const auth = await guardTeam("team.update");
  if (!auth.ok) return { error: auth.error };

  const parsed = roleListSchema.safeParse(roleNames);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Selecione pelo menos um papel." };

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    with: { userRoles: { with: { role: true } } },
  });
  if (!user) return { error: "Usuário não encontrado." };

  const currentRoles = user.userRoles.map((ur) => ur.role.name);
  // proteção: mexer em papéis privilegiados (conceder OU remover) exige OWNER/ADMIN
  const touchingPrivileged =
    ensureCanGrantRoles(auth.session.roles, parsed.data) ||
    ensureCanGrantRoles(auth.session.roles, currentRoles);
  if (touchingPrivileged) return { error: touchingPrivileged };

  // não permitir que o usuário remova o próprio acesso administrativo
  if (userId === auth.session.userId) {
    const stillAdmin = parsed.data.some((r) => r === "OWNER" || r === "ADMIN");
    const wasAdmin = currentRoles.some((r) => r === "OWNER" || r === "ADMIN");
    if (wasAdmin && !stillAdmin) {
      return { error: "Você não pode remover o seu próprio acesso administrativo." };
    }
  }

  await setUserRoles(userId, parsed.data);
  await logActivity({
    userId: auth.session.userId,
    action: "team.rolesUpdated",
    entityType: "user",
    entityId: userId,
    metadata: { email: user.email, from: currentRoles, to: parsed.data },
  });

  revalidatePath("/equipe");
  return { success: "Nível de acesso atualizado." };
}

const profileSchema = z.object({
  name: z.string().trim().min(2, "Nome muito curto"),
  position: z.string().trim().optional(),
  phone: z.string().trim().optional(),
});

/** Edita nome, cargo e telefone do colaborador direto na tela. */
export async function updateMemberProfile(
  userId: string,
  input: { name: string; position?: string; phone?: string },
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
    await db
      .update(teamMembers)
      .set({ position: d.position ?? null, phone: d.phone ?? null })
      .where(eq(teamMembers.userId, userId));
  } else {
    await db.insert(teamMembers).values({ userId, position: d.position, phone: d.phone, status: "ATIVO" });
  }

  await logActivity({
    userId: auth.session.userId,
    action: "team.profileUpdated",
    entityType: "user",
    entityId: userId,
    metadata: { name: d.name, position: d.position ?? null },
  });
  revalidatePath("/equipe");
  return { success: "Dados do colaborador atualizados." };
}

/**
 * Exclui um colaborador de forma definitiva e segura. Antes de remover, anula
 * as referências (autoria/atribuição) que apontam para o usuário e cujo FK é
 * restritivo — preservando o histórico operacional sem violar integridade.
 * Tudo em transação: se algo falhar, nada é excluído.
 */
export async function deleteTeamMember(userId: string): Promise<ActionState> {
  const auth = await guardTeam("team.delete");
  if (!auth.ok) return { error: auth.error };
  if (userId === auth.session.userId) return { error: "Você não pode excluir a si mesmo." };

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    with: { userRoles: { with: { role: true } } },
  });
  if (!user) return { error: "Usuário não encontrado." };

  const targetRoles = user.userRoles.map((ur) => ur.role.name);
  // Só OWNER pode excluir OWNER/ADMIN (mesma proteção da concessão de papéis)
  const touchingPrivileged = ensureCanGrantRoles(auth.session.roles, targetRoles);
  if (touchingPrivileged) return { error: touchingPrivileged };

  // Nunca deixar o sistema sem nenhum OWNER
  if (targetRoles.includes("OWNER")) {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(and(eq(roles.name, "OWNER"), ne(userRoles.userId, userId)));
    if (!n) return { error: "Não é possível excluir o último OWNER do sistema." };
  }

  try {
    await db.transaction(async (tx) => {
      // Anula referências restritivas (não-CASCADE) que apontam para o usuário
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
      // Remove o usuário; tabelas com FK CASCADE (papéis, notificações, etc.) saem juntas
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
    metadata: { email: user.email, name: user.name, roles: targetRoles },
  });
  revalidatePath("/equipe");
  return { success: `${user.name} foi excluído(a) do sistema.` };
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
  await db
    .update(users)
    .set({ isActive: newActive, status: newActive ? "ATIVO" : "INATIVO" })
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
