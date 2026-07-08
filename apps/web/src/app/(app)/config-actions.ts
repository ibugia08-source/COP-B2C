"use server";

import { and, eq, sql as dsql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { configOptionGroups, configOptions } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { getSession } from "@/lib/auth/session";
import { getBuiltinGroup } from "@/lib/config-options";

export type ActionState = { error?: string; success?: string };

const TONES = ["green", "amber", "red", "blue", "purple", "zinc", "cyan"];

async function requireAdmin() {
  const session = await getSession();
  if (!session) return { ok: false as const, error: "Sessão expirada." };
  if (!session.roles.some((r) => r === "OWNER" || r === "ADMIN")) {
    return { ok: false as const, error: "Apenas administradores configuram opções." };
  }
  return { ok: true as const, session };
}

/**
 * Garante que o grupo e suas opções built-in existam no banco (materializa),
 * para que possam receber IDs e ser editados/reordenados.
 */
async function materialize(moduleKey: string, groupKey: string): Promise<string | null> {
  const builtin = getBuiltinGroup(moduleKey, groupKey);
  let group = await db.query.configOptionGroups.findFirst({
    where: and(eq(configOptionGroups.moduleKey, moduleKey), eq(configOptionGroups.groupKey, groupKey)),
  });
  if (!group) {
    if (!builtin) return null;
    [group] = await db
      .insert(configOptionGroups)
      .values({ moduleKey, groupKey, name: builtin.name, isSystem: builtin.isSystem })
      .returning();
  }
  const existing = await db.query.configOptions.findMany({ where: eq(configOptions.groupId, group.id) });
  if (existing.length === 0 && builtin && builtin.options.length) {
    await db.insert(configOptions).values(
      builtin.options.map((o, i) => ({
        groupId: group!.id,
        label: o.label,
        value: o.value,
        color: o.color,
        order: i,
        isActive: true,
        isSystem: builtin.isSystem,
      })),
    );
  }
  return group.id;
}

/** Materializa (se preciso) e devolve o groupId — usado pelo drawer ao abrir. */
export async function ensureGroup(moduleKey: string, groupKey: string): Promise<{ groupId: string | null }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { groupId: null };
  const groupId = await materialize(moduleKey, groupKey);
  revalidatePath("/");
  return { groupId };
}

export async function createOption(
  moduleKey: string,
  groupKey: string,
  label: string,
  color: string,
): Promise<ActionState> {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };
  const clean = label.trim();
  if (clean.length < 1) return { error: "Informe o nome da opção." };
  const groupId = await materialize(moduleKey, groupKey);
  if (!groupId) return { error: "Grupo inválido." };

  const value = clean; // grupos livres usam o próprio rótulo como valor
  const dup = await db.query.configOptions.findFirst({
    where: and(eq(configOptions.groupId, groupId), eq(configOptions.value, value)),
  });
  if (dup) return { error: "Já existe uma opção com esse nome." };

  const count = await db.$count(configOptions, eq(configOptions.groupId, groupId));
  await db.insert(configOptions).values({
    groupId,
    label: clean,
    value,
    color: TONES.includes(color) ? color : "zinc",
    order: count,
    isActive: true,
    isSystem: false,
  });
  await logActivity({ userId: auth.session.userId, action: "config.optionCreated", entityType: "configOption", metadata: { moduleKey, groupKey, label: clean } });
  revalidatePath("/");
  return { success: "Opção adicionada." };
}

export async function updateOption(optionId: string, label: string, color: string): Promise<ActionState> {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };
  const clean = label.trim();
  if (!clean) return { error: "Informe o nome da opção." };
  const option = await db.query.configOptions.findFirst({ where: eq(configOptions.id, optionId) });
  if (!option) return { error: "Opção não encontrada." };
  await db
    .update(configOptions)
    .set({ label: clean, color: TONES.includes(color) ? color : option.color, updatedAt: new Date() })
    .where(eq(configOptions.id, optionId));
  revalidatePath("/");
  return { success: "Opção atualizada." };
}

export async function toggleOption(optionId: string): Promise<ActionState> {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };
  const option = await db.query.configOptions.findFirst({ where: eq(configOptions.id, optionId) });
  if (!option) return { error: "Opção não encontrada." };
  await db
    .update(configOptions)
    .set({ isActive: !option.isActive, updatedAt: new Date() })
    .where(eq(configOptions.id, optionId));
  revalidatePath("/");
  return { success: option.isActive ? "Opção desativada." : "Opção reativada." };
}

export async function reorderOptions(orderedIds: string[]): Promise<ActionState> {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };
  for (let i = 0; i < orderedIds.length; i++) {
    await db.update(configOptions).set({ order: i }).where(eq(configOptions.id, orderedIds[i]));
  }
  revalidatePath("/");
  return { success: "Ordem salva." };
}

export async function deleteOption(optionId: string): Promise<ActionState> {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };
  const option = await db.query.configOptions.findFirst({
    where: eq(configOptions.id, optionId),
    with: { group: true },
  });
  if (!option) return { error: "Opção não encontrada." };
  if (option.isSystem) {
    return { error: "Opção do sistema não pode ser excluída — apenas desativada." };
  }
  // não excluir se estiver em uso
  const builtin = getBuiltinGroup(option.group.moduleKey, option.group.groupKey);
  if (builtin?.usage) {
    const { table, column } = builtin.usage;
    const rows = await db.execute(
      dsql`select count(*)::int as n from ${dsql.identifier(table)} where ${dsql.identifier(column)} = ${option.value}`,
    );
    const n = Number((rows as unknown as { rows?: { n: number }[] }).rows?.[0]?.n ?? (rows as unknown as { n: number }[])[0]?.n ?? 0);
    if (n > 0) return { error: `Não é possível excluir: ${n} registro(s) usam esta opção. Desative-a.` };
  }
  await db.delete(configOptions).where(eq(configOptions.id, optionId));
  revalidatePath("/");
  return { success: "Opção excluída." };
}

/** Restaura o grupo ao padrão do sistema (remove customizações e re-semeia). */
export async function restoreDefaults(moduleKey: string, groupKey: string): Promise<ActionState> {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };
  const group = await db.query.configOptionGroups.findFirst({
    where: and(eq(configOptionGroups.moduleKey, moduleKey), eq(configOptionGroups.groupKey, groupKey)),
  });
  if (group) {
    await db.delete(configOptions).where(eq(configOptions.groupId, group.id));
  }
  await materialize(moduleKey, groupKey);
  await logActivity({ userId: auth.session.userId, action: "config.groupRestored", entityType: "configOptionGroup", metadata: { moduleKey, groupKey } });
  revalidatePath("/");
  return { success: "Opções restauradas ao padrão." };
}
