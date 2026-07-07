"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { ROLE_NAMES, roles, teamMembers, userRoles, users } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { checkPermission } from "@/lib/auth/guard";
import { hashPassword } from "@/lib/auth/password";
import { PRIVILEGED_ROLES } from "@/lib/auth/permissions";
import { notifyUser } from "@/lib/notify";

export type ActionState = { error?: string; success?: string };

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
  const auth = await checkPermission("team.create");
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
  const auth = await checkPermission("team.approve");
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
  const auth = await checkPermission("team.approve");
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
  const auth = await checkPermission("team.update");
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

export async function toggleMemberActive(userId: string): Promise<ActionState> {
  const auth = await checkPermission("team.deactivate");
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
