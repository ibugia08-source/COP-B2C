import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { notifications, roles, userRoles, users, type RoleName } from "@/db/schema";

/** Só usuários ATIVOS recebem notificações (não INATIVO/PENDENTE/REJEITADO). */
export function isNotifiableUser(user: { isActive: boolean; status: string }): boolean {
  return user.isActive && user.status === "ATIVO";
}

type NotifyInput = {
  title: string;
  body?: string;
  type?: "INFO" | "ALERTA" | "COBRANCA" | "TAREFA" | "SISTEMA";
  entityType?: string;
  entityId?: string;
};

export async function notifyUser(userId: string, input: NotifyInput): Promise<void> {
  await db.insert(notifications).values({
    userId,
    type: input.type ?? "INFO",
    title: input.title,
    body: input.body,
    entityType: input.entityType,
    entityId: input.entityId,
  });
}

/** Notifica todos os usuários ATIVOS que possuem um papel. */
export async function notifyRole(role: RoleName, input: NotifyInput): Promise<void> {
  const rows = await db
    .select({ userId: userRoles.userId, isActive: users.isActive, status: users.status })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .innerJoin(users, eq(userRoles.userId, users.id))
    .where(and(eq(roles.name, role), eq(users.isActive, true), eq(users.status, "ATIVO")));
  const active = rows.filter(isNotifiableUser).map((r) => r.userId);
  if (!active.length) return;
  await db.insert(notifications).values(
    active.map((userId) => ({
      userId,
      type: input.type ?? "INFO",
      title: input.title,
      body: input.body,
      entityType: input.entityType,
      entityId: input.entityId,
    })),
  );
}
