import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  automationExecutionLogs,
  automationRules,
  clients,
  taskComments,
  tasks,
  type AutomationTrigger,
  type RoleName,
} from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { notifyRole, notifyUser } from "@/lib/notify";
import { applyTemplateToClient } from "@/lib/templates";

// Payload padrão dos eventos. Campos usados pelas condições/ações.
export type AutomationPayload = {
  clientId?: string;
  taskId?: string;
  receivableId?: string;
  formSlug?: string;
  assigneeId?: string | null;
  withoutAssignee?: boolean;
  fromStage?: string;
  toStage?: string;
  fromHealth?: string;
  toHealth?: string;
  actorId?: string | null;
  comment?: string;
  // dados extras livres para log
  [key: string]: unknown;
};

const MAX_DEPTH = 2; // trava anti-loop: eventos gerados por automações não re-disparam em cadeia infinita

/** Condições são igualdade rasa: {toStage:"X"} casa se payload.toStage === "X". */
function matches(conditions: Record<string, unknown> | null, payload: AutomationPayload): boolean {
  if (!conditions) return true;
  return Object.entries(conditions).every(([key, value]) => payload[key] === value);
}

async function runAction(
  action: { type: string; params?: Record<string, unknown> },
  payload: AutomationPayload,
  depth: number,
): Promise<Record<string, unknown>> {
  const p = action.params ?? {};
  switch (action.type) {
    case "APPLY_TEMPLATE": {
      if (!payload.clientId) throw new Error("APPLY_TEMPLATE requer clientId no payload");
      const result = await applyTemplateToClient(String(p.templateSlug), payload.clientId, {
        actorId: payload.actorId,
        asChecklist: p.asChecklist === true,
      });
      return { ...result };
    }
    case "CREATE_TASK": {
      const [task] = await db
        .insert(tasks)
        .values({
          title: String(p.title ?? "Tarefa criada por automação"),
          description: p.description ? String(p.description) : null,
          type: "OPERACIONAL",
          status: "A_FAZER",
          priority: "MEDIA",
          clientId: payload.clientId ?? null,
          assignedToId: (p.assignedToId as string | undefined) ?? payload.assigneeId ?? null,
          createdById: payload.actorId ?? null,
        })
        .returning();
      // eventos derivados respeitam a trava de profundidade
      await emitEvent("TASK_CREATED", { taskId: task.id, clientId: task.clientId ?? undefined, withoutAssignee: !task.assignedToId, actorId: payload.actorId }, depth + 1);
      return { taskId: task.id };
    }
    case "SEND_NOTIFICATION": {
      const input = {
        title: String(p.title ?? "Notificação do COP"),
        body: p.body ? String(p.body) : undefined,
        type: (p.type as "INFO" | "ALERTA" | "COBRANCA" | "TAREFA" | "SISTEMA") ?? "INFO",
        entityType: payload.clientId ? "client" : payload.taskId ? "task" : undefined,
        entityId: payload.clientId ?? payload.taskId,
      };
      if (p.toAssignee && payload.assigneeId) {
        await notifyUser(payload.assigneeId, input);
        return { notified: payload.assigneeId };
      }
      if (p.toRole) {
        await notifyRole(p.toRole as RoleName, input);
        return { notifiedRole: p.toRole };
      }
      return { skipped: "sem destinatário" };
    }
    case "UPDATE_CLIENT_FIELD": {
      if (!payload.clientId) throw new Error("UPDATE_CLIENT_FIELD requer clientId");
      const allowed = ["adsStatus", "notes", "healthStatus", "status"] as const;
      const field = String(p.field);
      if (!allowed.includes(field as (typeof allowed)[number])) {
        throw new Error(`Campo não permitido em automação: ${field}`);
      }
      await db
        .update(clients)
        .set({ [field]: p.value } as Record<string, unknown>)
        .where(eq(clients.id, payload.clientId));
      return { field, value: p.value };
    }
    case "UPDATE_TASK_FIELD": {
      if (!payload.taskId) throw new Error("UPDATE_TASK_FIELD requer taskId");
      const allowed = ["status", "priority", "dueDate"] as const;
      const field = String(p.field);
      if (!allowed.includes(field as (typeof allowed)[number])) {
        throw new Error(`Campo não permitido em automação: ${field}`);
      }
      await db
        .update(tasks)
        .set({ [field]: p.value } as Record<string, unknown>)
        .where(eq(tasks.id, payload.taskId));
      return { field, value: p.value };
    }
    case "ADD_COMMENT": {
      if (p.toClientHistory && payload.clientId) {
        await logActivity({
          userId: payload.actorId,
          action: "client.commentAdded",
          entityType: "client",
          entityId: payload.clientId,
          metadata: { comment: payload.comment ?? p.comment ?? "" },
        });
        return { addedToClientHistory: true };
      }
      if (payload.taskId) {
        await db.insert(taskComments).values({
          taskId: payload.taskId,
          authorId: payload.actorId ?? null,
          body: String(p.comment ?? payload.comment ?? "Comentário automático"),
        });
        return { addedToTask: true };
      }
      return { skipped: "sem alvo" };
    }
    case "CREATE_ACTIVITY_LOG": {
      await logActivity({
        userId: payload.actorId,
        action: String(p.action ?? "automation.customLog"),
        entityType: payload.clientId ? "client" : payload.taskId ? "task" : "system",
        entityId: payload.clientId ?? payload.taskId ?? null,
        metadata: { automated: true },
      });
      return { logged: true };
    }
    case "CHANGE_CLIENT_HEALTH": {
      if (!payload.clientId) throw new Error("CHANGE_CLIENT_HEALTH requer clientId");
      await db
        .update(clients)
        .set({ healthStatus: p.value as "ESTAVEL" | "OBSERVACAO" | "CRITICO" })
        .where(eq(clients.id, payload.clientId));
      return { healthStatus: p.value };
    }
    case "MARK_CLIENT_AS_RISK": {
      if (!payload.clientId) throw new Error("MARK_CLIENT_AS_RISK requer clientId");
      await db
        .update(clients)
        .set({ status: "EM_RISCO" })
        .where(eq(clients.id, payload.clientId));
      return { status: "EM_RISCO" };
    }
    default:
      throw new Error(`Ação desconhecida: ${action.type}`);
  }
}

/**
 * Dispara um evento de automação. NUNCA lança erro (falha de automação não
 * pode quebrar a ação principal) — toda execução vira AutomationExecutionLog.
 */
export async function emitEvent(
  trigger: AutomationTrigger,
  payload: AutomationPayload,
  depth = 0,
): Promise<void> {
  try {
    if (depth >= MAX_DEPTH) return; // anti-loop

    const rules = await db.query.automationRules.findMany({
      where: eq(automationRules.triggerType, trigger),
    });

    for (const rule of rules) {
      if (!rule.enabled) continue;
      if (!matches(rule.conditions ?? null, payload)) {
        await db.insert(automationExecutionLogs).values({
          ruleId: rule.id,
          status: "IGNORADA",
          payload: payload as Record<string, unknown>,
          detail: { reason: "condições não atendidas" },
        });
        continue;
      }
      try {
        const results: Record<string, unknown>[] = [];
        for (const action of rule.actions ?? []) {
          results.push(await runAction(action, payload, depth));
        }
        await db.insert(automationExecutionLogs).values({
          ruleId: rule.id,
          status: "SUCESSO",
          payload: payload as Record<string, unknown>,
          detail: { results },
        });
      } catch (err) {
        await db.insert(automationExecutionLogs).values({
          ruleId: rule.id,
          status: "ERRO",
          payload: payload as Record<string, unknown>,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    console.error(`Falha no motor de automações (${trigger}):`, err);
  }
}
