"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { automationRules } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { checkPermission } from "@/lib/auth/guard";

export type ActionState = { error?: string; success?: string };

export async function toggleAutomation(ruleId: string): Promise<ActionState> {
  const auth = await checkPermission("automations.update");
  if (!auth.ok) return { error: auth.error };

  const rule = await db.query.automationRules.findFirst({ where: eq(automationRules.id, ruleId) });
  if (!rule) return { error: "Automação não encontrada." };

  // Regras globais só podem ser alteradas por OWNER/ADMIN
  const isOwnerAdmin = auth.session.roles.some((r) => r === "OWNER" || r === "ADMIN");
  if (rule.scope === "GLOBAL" && !isOwnerAdmin) {
    return { error: "Apenas OWNER/ADMIN podem alterar automações globais." };
  }

  await db.update(automationRules).set({ enabled: !rule.enabled }).where(eq(automationRules.id, ruleId));
  await logActivity({
    userId: auth.session.userId,
    action: rule.enabled ? "automation.disabled" : "automation.enabled",
    entityType: "automationRule",
    entityId: ruleId,
    metadata: { name: rule.name },
  });
  revalidatePath("/automacoes");
  return { success: rule.enabled ? "Automação desativada." : "Automação ativada." };
}
