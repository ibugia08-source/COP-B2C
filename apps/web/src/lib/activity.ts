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
    // Log de atividade nunca derruba a operação principal — mas a falha vira
    // stderr estruturado para não perder o sinal (contadores/alertas externos).
    console.error(
      JSON.stringify({
        level: "error",
        event: "activity_log_write_failed",
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        message: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}
