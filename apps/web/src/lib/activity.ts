import { db } from "@/db";
import { activityLogs } from "@/db/schema";

type LogInput = {
  userId?: string | null;
  action: string; // ex.: "auth.login", "team.memberDeactivated", "vault.secretRevealed"
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function logActivity(input: LogInput): Promise<void> {
  try {
    await db.insert(activityLogs).values({
      userId: input.userId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      metadata: input.metadata,
    });
  } catch (err) {
    // Log de auditoria nunca deve derrubar a operação principal
    console.error("Falha ao registrar ActivityLog:", err);
  }
}
