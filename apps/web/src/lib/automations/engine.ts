import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  ADS_STATUSES,
  CLIENT_STATUSES,
  HEALTH_STATUSES,
  TASK_PRIORITIES,
  TASK_STATUSES,
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

// ---------------------------------------------------------------------------
// Condições
// ---------------------------------------------------------------------------

const CONDITION_OPS = ["eq", "ne", "in", "gt", "gte", "lt", "lte"] as const;
export type ConditionOp = (typeof CONDITION_OPS)[number];
export type ConditionRule = { op: ConditionOp; field: string; value: unknown };

function isConditionRule(value: unknown): value is ConditionRule {
  return (
    !!value &&
    typeof value === "object" &&
    "op" in value &&
    "field" in value &&
    CONDITION_OPS.includes((value as ConditionRule).op)
  );
}

/** Resolve "a.b.c" dentro do payload (objetos aninhados). */
function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

function compare(actual: unknown, value: unknown, op: "gt" | "gte" | "lt" | "lte"): boolean {
  if (actual == null || value == null) return false;
  const a = actual as number | string;
  const b = value as number | string;
  if (typeof a !== typeof b) return false;
  switch (op) {
    case "gt":
      return a > b;
    case "gte":
      return a >= b;
    case "lt":
      return a < b;
    case "lte":
      return a <= b;
  }
}

function evalRule(rule: ConditionRule, payload: AutomationPayload): boolean {
  const actual = getPath(payload, rule.field);
  switch (rule.op) {
    case "eq":
      return actual === rule.value;
    case "ne":
      return actual !== rule.value;
    case "in":
      return Array.isArray(rule.value) && rule.value.includes(actual);
    default:
      return compare(actual, rule.value, rule.op);
  }
}

/**
 * Avalia as condições de uma regra. Formatos aceitos:
 * - null/undefined → sempre casa
 * - objeto plano legado {toStage:"X"} → igualdade rasa por chave (retrocompatível)
 * - regra única { op, field, value } — field aceita caminho pontilhado ("a.b")
 * - array de regras → todas precisam casar
 */
export function evaluateConditions(
  conditions: unknown,
  payload: AutomationPayload,
): boolean {
  if (!conditions) return true;
  if (Array.isArray(conditions)) {
    return conditions.every((c) => isConditionRule(c) && evalRule(c, payload));
  }
  if (isConditionRule(conditions)) return evalRule(conditions, payload);
  if (typeof conditions === "object") {
    return Object.entries(conditions as Record<string, unknown>).every(
      ([key, value]) => getPath(payload, key) === value,
    );
  }
  return false;
}

// ---------------------------------------------------------------------------
// Validação de valores por campo (regra malformada não grava enum inválido)
// ---------------------------------------------------------------------------

const CLIENT_FIELD_SCHEMAS: Record<string, z.ZodType> = {
  adsStatus: z.enum(ADS_STATUSES),
  healthStatus: z.enum(HEALTH_STATUSES),
  status: z.enum(CLIENT_STATUSES),
  notes: z.string(),
};

const TASK_FIELD_SCHEMAS: Record<string, z.ZodType> = {
  status: z.enum(TASK_STATUSES),
  priority: z.enum(TASK_PRIORITIES),
  dueDate: z.union([z.iso.datetime(), z.iso.date(), z.date()]),
};

export type FieldValidation = { ok: true; value: unknown } | { ok: false; error: string };

/** Valida campo E valor de UPDATE_CLIENT_FIELD/UPDATE_TASK_FIELD. */
export function validateAutomationFieldValue(
  entity: "client" | "task",
  field: string,
  value: unknown,
): FieldValidation {
  const schemas = entity === "client" ? CLIENT_FIELD_SCHEMAS : TASK_FIELD_SCHEMAS;
  const schema = schemas[field];
  if (!schema) return { ok: false, error: `Campo não permitido em automação: ${field}` };
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, error: `Valor inválido para ${entity}.${field}: ${JSON.stringify(value)}` };
  }
  const out = field === "dueDate" && !(parsed.data instanceof Date) ? new Date(parsed.data as string) : parsed.data;
  return { ok: true, value: out };
}

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------

/** Executor de escrita dentro da transação da regra. */
type TxExecutor = Pick<typeof db, "insert" | "update">;

/** Evento derivado a emitir APÓS o commit da transação da regra. */
type DeferredEvent = { trigger: AutomationTrigger; payload: AutomationPayload; depth: number };

async function runAction(
  action: { type: string; params?: Record<string, unknown> },
  payload: AutomationPayload,
  depth: number,
  tx: TxExecutor,
  deferred: DeferredEvent[],
): Promise<Record<string, unknown>> {
  const p = action.params ?? {};
  switch (action.type) {
    case "APPLY_TEMPLATE": {
      if (!payload.clientId) throw new Error("APPLY_TEMPLATE requer clientId no payload");
      // usa o db global (fora da transação da regra): cria tarefas via helper próprio
      const result = await applyTemplateToClient(String(p.templateSlug), payload.clientId, {
        actorId: payload.actorId,
        asChecklist: p.asChecklist === true,
      });
      return { ...result };
    }
    case "CREATE_TASK": {
      const [task] = await tx
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
      // eventos derivados só disparam DEPOIS do commit (e respeitam a trava de profundidade)
      deferred.push({
        trigger: "TASK_CREATED",
        payload: {
          taskId: task.id,
          clientId: task.clientId ?? undefined,
          withoutAssignee: !task.assignedToId,
          actorId: payload.actorId,
        },
        depth: depth + 1,
      });
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
      const field = String(p.field);
      const valid = validateAutomationFieldValue("client", field, p.value);
      if (!valid.ok) throw new Error(valid.error);
      await tx
        .update(clients)
        .set({ [field]: valid.value } as Record<string, unknown>)
        .where(eq(clients.id, payload.clientId));
      return { field, value: valid.value };
    }
    case "UPDATE_TASK_FIELD": {
      if (!payload.taskId) throw new Error("UPDATE_TASK_FIELD requer taskId");
      const field = String(p.field);
      const valid = validateAutomationFieldValue("task", field, p.value);
      if (!valid.ok) throw new Error(valid.error);
      await tx
        .update(tasks)
        .set({ [field]: valid.value } as Record<string, unknown>)
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
        await tx.insert(taskComments).values({
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
      const valid = validateAutomationFieldValue("client", "healthStatus", p.value);
      if (!valid.ok) throw new Error(valid.error);
      await tx
        .update(clients)
        .set({ healthStatus: valid.value as (typeof HEALTH_STATUSES)[number] })
        .where(eq(clients.id, payload.clientId));
      return { healthStatus: valid.value };
    }
    case "MARK_CLIENT_AS_RISK": {
      if (!payload.clientId) throw new Error("MARK_CLIENT_AS_RISK requer clientId");
      await tx
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
 *
 * As ações de UMA regra rodam dentro de UMA transação: se qualquer ação
 * falhar, as escritas diretas das anteriores revertem e a execução é
 * registrada como ERRO com o detalhe da ação que falhou. Notificações e
 * activity logs são advisories (fora da transação) — podem sobreviver a um
 * rollback, mas nunca corrompem dados.
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
      if (!evaluateConditions(rule.conditions ?? null, payload)) {
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
        const deferred: DeferredEvent[] = [];
        await db.transaction(async (tx) => {
          let index = 0;
          for (const action of rule.actions ?? []) {
            try {
              results.push(await runAction(action, payload, depth, tx, deferred));
            } catch (err) {
              // contexto de qual ação quebrou vai para o log de ERRO
              throw new Error(
                `Ação ${index + 1} (${action.type}) falhou: ${err instanceof Error ? err.message : String(err)}`,
              );
            }
            index++;
          }
        });
        // eventos derivados só após o commit — rollback não emite nada
        for (const d of deferred) {
          await emitEvent(d.trigger, d.payload, d.depth);
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
    console.error(
      JSON.stringify({
        level: "error",
        event: "automation_engine_failed",
        trigger,
        message: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}
