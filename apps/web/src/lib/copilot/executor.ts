import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { addDaysDateOnly, todayDateOnly } from "@/lib/date";
import {
  clients,
  conversationSummaries,
  documents,
  HEALTH_STATUSES,
  monitoredConversations,
  PIPELINE_STAGES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  taskComments,
  tasks,
  type CopilotAction,
  type CopilotSuggestion,
  type TaskPriority,
} from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { type PermissionKey } from "@/lib/auth/permissions";
import { can } from "@/lib/auth/access";
import type { SessionPayload } from "@/lib/auth/session";
import { notifyUser } from "@/lib/notify";
import { buildClientReport, type ReportKind } from "./reports";

/**
 * Executor das ações estruturadas do Co-piloto. Roda APENAS após aprovação
 * explícita do gestor. Cada ação:
 *  1. valida a permissão do usuário aprovador;
 *  2. valida o payload (zod);
 *  3. executa reutilizando as mesmas regras dos módulos;
 *  4. registra ActivityLog.
 * Falhas retornam erro claro (a ação fica FALHOU e pode ser tentada de novo).
 */

export type ExecResult =
  | { ok: true; resultSummary: string; resultRef?: string }
  | { ok: false; error: string };

// Permissão mínima exigida por tipo de ação
export const ACTION_PERMISSIONS: Record<string, PermissionKey> = {
  CREATE_TASK: "tasks.create",
  UPDATE_TASK_STATUS: "tasks.update",
  UPDATE_TASK_PRIORITY: "tasks.update",
  UPDATE_CLIENT_HEALTH: "clients.update",
  UPDATE_CLIENT_STATUS: "clients.moveStatus",
  CREATE_CLIENT_COMMENT: "clients.view",
  CREATE_TASK_COMMENT: "tasks.view",
  CREATE_REMINDER: "tasks.view",
  CREATE_MEETING: "clients.update",
  GENERATE_REPORT: "clients.view",
  PREPARE_WHATSAPP_MESSAGE: "tasks.view",
  SEND_WHATSAPP_MESSAGE_FUTURE: "tasks.view",
  LINK_CONVERSATION_TO_CLIENT: "tasks.view",
};

// Schemas de payload por tipo
const PAYLOADS = {
  CREATE_TASK: z.object({
    title: z.string().trim().min(3),
    description: z.string().trim().optional(),
    clientId: z.string().optional().nullable(),
    digitalAssetId: z.string().optional().nullable(),
    priority: z.enum(TASK_PRIORITIES).default("MEDIA"),
    dueDays: z.number().int().positive().max(90).default(2),
  }),
  UPDATE_TASK_STATUS: z.object({
    taskId: z.string().min(1),
    status: z.enum(TASK_STATUSES),
  }),
  UPDATE_TASK_PRIORITY: z.object({
    taskId: z.string().min(1),
    priority: z.enum(TASK_PRIORITIES),
  }),
  UPDATE_CLIENT_HEALTH: z.object({
    clientId: z.string().min(1),
    healthStatus: z.enum(HEALTH_STATUSES),
    reason: z.string().trim().min(5),
  }),
  UPDATE_CLIENT_STATUS: z.object({
    clientId: z.string().min(1),
    pipelineStage: z.enum(PIPELINE_STAGES),
    criticalReason: z.string().optional(),
    actionPlan: z.string().optional(),
  }),
  CREATE_CLIENT_COMMENT: z.object({
    clientId: z.string().min(1),
    comment: z.string().trim().min(3),
  }),
  CREATE_TASK_COMMENT: z.object({
    taskId: z.string().min(1),
    body: z.string().trim().min(3),
  }),
  CREATE_REMINDER: z.object({
    title: z.string().trim().min(3),
    body: z.string().trim().optional(),
  }),
  CREATE_MEETING: z.object({
    clientId: z.string().min(1),
    title: z.string().trim().min(3),
    meetingDate: z.string().min(10), // ISO
    meetingType: z.string().default("ALINHAMENTO"),
    summary: z.string().optional(),
  }),
  GENERATE_REPORT: z.object({
    clientId: z.string().min(1),
    kind: z.enum(["RESUMO", "PLANO_ACAO"]).default("RESUMO"),
  }),
  PREPARE_WHATSAPP_MESSAGE: z.object({
    clientId: z.string().optional().nullable(),
    message: z.string().trim().min(5),
  }),
  SEND_WHATSAPP_MESSAGE_FUTURE: z.object({
    message: z.string().trim().min(1),
  }),
  LINK_CONVERSATION_TO_CLIENT: z.object({
    conversationId: z.string().min(1),
    clientId: z.string().min(1),
  }),
} as const;

export async function executeCopilotAction(
  action: CopilotAction,
  suggestion: CopilotSuggestion,
  session: SessionPayload,
): Promise<ExecResult> {
  // 1) permissão do aprovador
  const permission = ACTION_PERMISSIONS[action.actionType];
  if (!permission || !can(session, permission)) {
    return { ok: false, error: `Você não tem a permissão necessária (${permission ?? action.actionType}) para executar esta ação.` };
  }

  // 2) payload
  const schema = PAYLOADS[action.actionType as keyof typeof PAYLOADS];
  if (!schema) return { ok: false, error: "Tipo de ação desconhecido." };
  const parsed = schema.safeParse(action.payload);
  if (!parsed.success) {
    return { ok: false, error: `Payload inválido: ${parsed.error.issues[0]?.message ?? "verifique os dados da ação"}.` };
  }
  const p = parsed.data as Record<string, unknown>;

  // 3) execução por tipo — reutilizando as regras dos módulos
  try {
    switch (action.actionType) {
      case "CREATE_TASK": {
        const d = p as z.infer<typeof PAYLOADS.CREATE_TASK>;
        const [task] = await db
          .insert(tasks)
          .values({
            title: d.title,
            description: d.description ?? null,
            type: "OPERACIONAL",
            status: "A_FAZER",
            priority: d.priority as TaskPriority,
            clientId: d.clientId || null,
            digitalAssetId: d.digitalAssetId || null,
            assignedToId: suggestion.userId,
            createdById: session.userId,
            dueDate: addDaysDateOnly(todayDateOnly(), d.dueDays),
          })
          .returning();
        await logActivity({
          userId: session.userId,
          action: "task.created",
          entityType: "task",
          entityId: task.id,
          metadata: { title: task.title, viaCopilot: true },
        });
        return { ok: true, resultSummary: `Tarefa "${task.title}" criada.`, resultRef: `/tarefas/${task.id}` };
      }

      case "UPDATE_TASK_STATUS": {
        const d = p as z.infer<typeof PAYLOADS.UPDATE_TASK_STATUS>;
        const { changeTaskStatus } = await import("@/app/(app)/tarefas/actions");
        const result = await changeTaskStatus(d.taskId, d.status);
        if (result.error) return { ok: false, error: result.error };
        return { ok: true, resultSummary: `Status da tarefa alterado para ${d.status}.`, resultRef: `/tarefas/${d.taskId}` };
      }

      case "UPDATE_TASK_PRIORITY": {
        const d = p as z.infer<typeof PAYLOADS.UPDATE_TASK_PRIORITY>;
        const existing = await db.query.tasks.findFirst({ where: eq(tasks.id, d.taskId) });
        if (!existing) return { ok: false, error: "Tarefa não encontrada." };
        await db.update(tasks).set({ priority: d.priority as TaskPriority }).where(eq(tasks.id, d.taskId));
        await logActivity({
          userId: session.userId,
          action: "task.updated",
          entityType: "task",
          entityId: d.taskId,
          metadata: { priorityFrom: existing.priority, priorityTo: d.priority, viaCopilot: true },
        });
        return { ok: true, resultSummary: `Prioridade alterada de ${existing.priority} para ${d.priority}.`, resultRef: `/tarefas/${d.taskId}` };
      }

      case "UPDATE_CLIENT_HEALTH": {
        const d = p as z.infer<typeof PAYLOADS.UPDATE_CLIENT_HEALTH>;
        const { changeClientHealth } = await import("@/app/(app)/clientes/actions");
        const result = await changeClientHealth(d.clientId, d.healthStatus, d.reason);
        if (result.error) return { ok: false, error: result.error };
        return { ok: true, resultSummary: `Saúde do cliente alterada para ${d.healthStatus}.`, resultRef: `/clientes/${d.clientId}` };
      }

      case "UPDATE_CLIENT_STATUS": {
        const d = p as z.infer<typeof PAYLOADS.UPDATE_CLIENT_STATUS>;
        if (d.pipelineStage === "CLIENTE_PERDIDO") {
          return { ok: false, error: "Marcar cliente como perdido exige o fluxo específico na ficha do cliente (motivo de churn)." };
        }
        const { moveClientStage } = await import("@/app/(app)/operacao/actions");
        const result = await moveClientStage(d.clientId, d.pipelineStage);
        if (result.error) return { ok: false, error: result.error };
        return { ok: true, resultSummary: `Cliente movido para a etapa ${d.pipelineStage}.`, resultRef: `/clientes/${d.clientId}` };
      }

      case "CREATE_CLIENT_COMMENT": {
        const d = p as z.infer<typeof PAYLOADS.CREATE_CLIENT_COMMENT>;
        const client = await db.query.clients.findFirst({ where: eq(clients.id, d.clientId), columns: { id: true } });
        if (!client) return { ok: false, error: "Cliente não encontrado." };
        await logActivity({
          userId: session.userId,
          action: "client.commentAdded",
          entityType: "client",
          entityId: d.clientId,
          metadata: { comment: d.comment, viaCopilot: true },
        });
        return { ok: true, resultSummary: "Comentário registrado na timeline do cliente.", resultRef: `/clientes/${d.clientId}` };
      }

      case "CREATE_TASK_COMMENT": {
        const d = p as z.infer<typeof PAYLOADS.CREATE_TASK_COMMENT>;
        const task = await db.query.tasks.findFirst({ where: eq(tasks.id, d.taskId), columns: { id: true } });
        if (!task) return { ok: false, error: "Tarefa não encontrada." };
        await db.insert(taskComments).values({ taskId: d.taskId, authorId: session.userId, body: d.body });
        await logActivity({
          userId: session.userId,
          action: "task.commentAdded",
          entityType: "task",
          entityId: d.taskId,
          metadata: { viaCopilot: true },
        });
        return { ok: true, resultSummary: "Comentário adicionado à tarefa.", resultRef: `/tarefas/${d.taskId}` };
      }

      case "CREATE_REMINDER": {
        const d = p as z.infer<typeof PAYLOADS.CREATE_REMINDER>;
        await notifyUser(suggestion.userId, {
          title: `⏰ Lembrete: ${d.title}`,
          body: d.body,
          type: "TAREFA",
          entityType: "copilotSuggestion",
          entityId: suggestion.id,
        });
        return { ok: true, resultSummary: "Lembrete criado nas suas notificações.", resultRef: "/notificacoes" };
      }

      case "CREATE_MEETING": {
        const d = p as z.infer<typeof PAYLOADS.CREATE_MEETING>;
        const { registerMeeting } = await import("@/app/(app)/clientes/actions");
        const result = await registerMeeting(d.clientId, {
          title: d.title,
          meetingDate: d.meetingDate,
          meetingType: d.meetingType,
          status: "AGENDADA",
          participants: "",
          responsibleId: suggestion.userId,
          meetLink: "",
          summary: d.summary ?? "",
          nextSteps: "",
        });
        if (result.error) return { ok: false, error: result.error };
        return { ok: true, resultSummary: "Reunião agendada na ficha do cliente.", resultRef: `/clientes/${d.clientId}` };
      }

      case "GENERATE_REPORT": {
        const d = p as z.infer<typeof PAYLOADS.GENERATE_REPORT>;
        const report = await buildClientReport(d.clientId, d.kind as ReportKind);
        if (!report) return { ok: false, error: "Cliente não encontrado para gerar o relatório." };
        const [doc] = await db
          .insert(documents)
          .values({
            title: report.title,
            content: report.markdown,
            type: "RELATORIO",
            sourceType: "INTERNAL",
            clientId: d.clientId,
            createdById: session.userId,
            updatedById: session.userId,
          })
          .returning();
        await logActivity({
          userId: session.userId,
          action: "document.created",
          entityType: "client",
          entityId: d.clientId,
          metadata: { title: report.title, documentId: doc.id, viaCopilot: true },
        });
        return { ok: true, resultSummary: `Documento "${report.title}" gerado.`, resultRef: `/documentos/${doc.id}` };
      }

      case "PREPARE_WHATSAPP_MESSAGE": {
        const d = p as z.infer<typeof PAYLOADS.PREPARE_WHATSAPP_MESSAGE>;
        // Nenhum envio: apenas marca a mensagem como revisada/pronta.
        void d;
        return {
          ok: true,
          resultSummary: "Mensagem revisada e pronta — copie e envie manualmente pelo seu WhatsApp (envio automático virá com a integração oficial).",
        };
      }

      case "SEND_WHATSAPP_MESSAGE_FUTURE": {
        return {
          ok: false,
          error: "Envio automático indisponível: a integração oficial do WhatsApp ainda não está conectada. Use a mensagem preparada e envie manualmente.",
        };
      }

      case "LINK_CONVERSATION_TO_CLIENT": {
        const d = p as z.infer<typeof PAYLOADS.LINK_CONVERSATION_TO_CLIENT>;
        const conv = await db.query.monitoredConversations.findFirst({
          where: and(eq(monitoredConversations.id, d.conversationId), eq(monitoredConversations.userId, suggestion.userId)),
        });
        if (!conv) return { ok: false, error: "Conversa não encontrada (ou não pertence a você)." };
        const client = await db.query.clients.findFirst({ where: eq(clients.id, d.clientId), columns: { id: true, name: true } });
        if (!client) return { ok: false, error: "Cliente não encontrado." };
        await db
          .update(monitoredConversations)
          .set({ clientId: d.clientId, updatedAt: new Date() })
          .where(eq(monitoredConversations.id, d.conversationId));
        await db
          .update(conversationSummaries)
          .set({ clientId: d.clientId })
          .where(eq(conversationSummaries.conversationId, d.conversationId));
        await logActivity({
          userId: session.userId,
          action: "copilot.conversationLinked",
          entityType: "monitoredConversation",
          entityId: d.conversationId,
          metadata: { clientId: d.clientId, viaCopilot: true },
        });
        return { ok: true, resultSummary: `Conversa vinculada ao cliente ${client.name}.`, resultRef: `/copiloto/whatsapp` };
      }

      default:
        return { ok: false, error: "Tipo de ação não suportado nesta versão." };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Falha inesperada ao executar a ação." };
  }
}
