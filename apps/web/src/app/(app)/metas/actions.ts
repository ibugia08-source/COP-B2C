"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { GOAL_CATEGORIES, GOAL_SCOPES, GOAL_STATUSES, goals } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { checkPermission } from "@/lib/auth/guard";
import { notifyGoal } from "@/lib/goals/reminders";

export type ActionState = { error?: string; success?: string };

const goalSchema = z.object({
  title: z.string().trim().min(3, "Nome muito curto"),
  description: z.string().trim().optional(),
  category: z.enum(GOAL_CATEGORIES),
  scope: z.enum(GOAL_SCOPES),
  status: z.enum(GOAL_STATUSES),
  targetValue: z.coerce.number().nonnegative("Meta inválida"),
  superTargetValue: z.coerce.number().nonnegative().optional(),
  megaTargetValue: z.coerce.number().nonnegative().optional(),
  currentValue: z.coerce.number().nonnegative().default(0),
  unit: z.string().trim().optional(),
  ownerId: z.string().optional(),
  autoProgress: z.boolean().default(false),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
});

export async function saveGoal(
  goalId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await checkPermission(goalId ? "goals.update" : "goals.create");
  if (!auth.ok) return { error: auth.error };

  const parsed = goalSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    category: formData.get("category"),
    scope: formData.get("scope"),
    status: formData.get("status"),
    targetValue: formData.get("targetValue"),
    superTargetValue: formData.get("superTargetValue") || undefined,
    megaTargetValue: formData.get("megaTargetValue") || undefined,
    currentValue: formData.get("currentValue") || 0,
    unit: formData.get("unit") || undefined,
    ownerId: formData.get("ownerId") || undefined,
    autoProgress: formData.get("autoProgress") === "on",
    periodStart: formData.get("periodStart") || undefined,
    periodEnd: formData.get("periodEnd") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const d = parsed.data;

  const values = {
    title: d.title,
    description: d.description ?? null,
    category: d.category,
    scope: d.scope,
    status: d.status,
    targetValue: d.targetValue,
    superTargetValue: d.superTargetValue ?? null,
    megaTargetValue: d.megaTargetValue ?? null,
    currentValue: d.currentValue,
    unit: d.unit ?? null,
    ownerId: d.ownerId || null,
    autoProgress: d.autoProgress,
    periodStart: d.periodStart || null,
    periodEnd: d.periodEnd || null,
  };

  if (goalId) {
    const existing = await db.query.goals.findFirst({ where: eq(goals.id, goalId) });
    await db.update(goals).set(values).where(eq(goals.id, goalId));
    // notifica conclusão quando a meta passa a CONCLUIDA
    if (values.status === "CONCLUIDA" && existing && existing.status !== "CONCLUIDA") {
      await notifyGoal(
        { id: goalId, ownerId: values.ownerId },
        {
          title: `Meta concluída 🎉 ${d.title}`,
          body: "Parabéns! Esta meta foi marcada como concluída.",
          type: "INFO",
        },
      );
    }
  } else {
    const [goal] = await db.insert(goals).values(values).returning();
    await notifyGoal(
      { id: goal.id, ownerId: goal.ownerId },
      {
        title: `Nova meta: ${d.title}`,
        body: d.periodEnd
          ? `Prazo até ${d.periodEnd}. Acompanhe o progresso em Metas.`
          : "Uma nova meta foi criada. Acompanhe o progresso em Metas.",
        type: "INFO",
      },
    );
  }
  await logActivity({
    userId: auth.session.userId,
    action: goalId ? "goal.updated" : "goal.created",
    entityType: "goal",
    entityId: goalId,
    metadata: { title: d.title },
  });
  revalidatePath("/metas");
  revalidatePath("/notificacoes");
  return { success: goalId ? "Meta atualizada." : "Meta criada." };
}

export async function updateGoalProgress(goalId: string, currentValue: number): Promise<ActionState> {
  const auth = await checkPermission("goals.update");
  if (!auth.ok) return { error: auth.error };
  if (!Number.isFinite(currentValue) || currentValue < 0) return { error: "Valor inválido." };
  await db.update(goals).set({ currentValue }).where(eq(goals.id, goalId));
  revalidatePath("/metas");
  return { success: "Progresso atualizado." };
}

export async function deleteGoal(goalId: string): Promise<ActionState> {
  const auth = await checkPermission("goals.delete");
  if (!auth.ok) return { error: auth.error };
  await db.delete(goals).where(eq(goals.id, goalId));
  await logActivity({
    userId: auth.session.userId,
    action: "goal.deleted",
    entityType: "goal",
    entityId: goalId,
  });
  revalidatePath("/metas");
  return { success: "Meta excluída." };
}
