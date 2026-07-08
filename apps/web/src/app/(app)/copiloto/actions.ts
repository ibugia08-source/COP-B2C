"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  conversationSummaries,
  copilotActions,
  copilotSuggestions,
  monitoredConversations,
  tasks,
  whatsappConnections,
  type CopilotAction,
  type CopilotSuggestion,
} from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { checkPermission, isAdmin } from "@/lib/auth/guard";
import type { SessionPayload } from "@/lib/auth/session";
import { executeCopilotAction } from "@/lib/copilot/executor";
import { summarizeConversation } from "@/lib/copilot/summarize";

export type ActionState = { error?: string; success?: string; taskId?: string };

function revalidateCopilot() {
  revalidatePath("/copiloto");
  revalidatePath("/copiloto/whatsapp");
}

/**
 * Guarda do Co-piloto: o usuário só mexe nas PRÓPRIAS sugestões; admins podem
 * atuar na visão geral. Toda decisão gera log de auditoria.
 */
async function guardSuggestion(
  suggestionId: string,
): Promise<{ ok: true; session: SessionPayload; suggestion: CopilotSuggestion } | { ok: false; error: string }> {
  const auth = await checkPermission("tasks.view");
  if (!auth.ok) return auth;
  const suggestion = await db.query.copilotSuggestions.findFirst({
    where: eq(copilotSuggestions.id, suggestionId),
  });
  if (!suggestion) return { ok: false, error: "Sugestão não encontrada." };
  if (suggestion.userId !== auth.session.userId && !isAdmin(auth.session)) {
    return { ok: false, error: "Você só pode decidir sobre as sugestões do seu próprio Co-piloto." };
  }
  return { ok: true, session: auth.session, suggestion };
}

/** Aprova uma sugestão (opcionalmente com a ação editada pelo gestor). */
export async function approveSuggestion(suggestionId: string, editedAction?: string): Promise<ActionState> {
  const auth = await guardSuggestion(suggestionId);
  if (!auth.ok) return { error: auth.error };
  if (auth.suggestion.status !== "PENDENTE") return { error: "Esta sugestão já foi decidida." };

  const action = editedAction?.trim() || auth.suggestion.suggestedAction;
  await db
    .update(copilotSuggestions)
    .set({
      status: "APROVADA",
      suggestedAction: action,
      resolvedById: auth.session.userId,
      resolvedAt: new Date(),
    })
    .where(eq(copilotSuggestions.id, suggestionId));
  await logActivity({
    userId: auth.session.userId,
    action: "copilot.suggestionApproved",
    entityType: "copilotSuggestion",
    entityId: suggestionId,
    metadata: { title: auth.suggestion.title, type: auth.suggestion.type, edited: !!editedAction },
  });
  revalidateCopilot();
  return { success: "Sugestão aprovada. Nada foi executado automaticamente — use as ações para aplicar." };
}

/** Rejeita uma sugestão (não volta a ser sugerida). */
export async function rejectSuggestion(suggestionId: string, reason?: string): Promise<ActionState> {
  const auth = await guardSuggestion(suggestionId);
  if (!auth.ok) return { error: auth.error };
  if (auth.suggestion.status !== "PENDENTE") return { error: "Esta sugestão já foi decidida." };

  await db
    .update(copilotSuggestions)
    .set({ status: "REJEITADA", resolvedById: auth.session.userId, resolvedAt: new Date() })
    .where(eq(copilotSuggestions.id, suggestionId));
  await logActivity({
    userId: auth.session.userId,
    action: "copilot.suggestionRejected",
    entityType: "copilotSuggestion",
    entityId: suggestionId,
    metadata: { title: auth.suggestion.title, type: auth.suggestion.type, reason: reason?.trim() || undefined },
  });
  revalidateCopilot();
  return { success: "Sugestão rejeitada." };
}

/** Edita a ação sugerida antes de decidir (apenas pendentes). */
export async function editSuggestion(suggestionId: string, suggestedAction: string): Promise<ActionState> {
  const auth = await guardSuggestion(suggestionId);
  if (!auth.ok) return { error: auth.error };
  if (auth.suggestion.status !== "PENDENTE") return { error: "Apenas sugestões pendentes podem ser editadas." };
  const clean = suggestedAction.trim();
  if (clean.length < 5) return { error: "Descreva a ação (mínimo 5 caracteres)." };

  await db.update(copilotSuggestions).set({ suggestedAction: clean }).where(eq(copilotSuggestions.id, suggestionId));
  await logActivity({
    userId: auth.session.userId,
    action: "copilot.suggestionEdited",
    entityType: "copilotSuggestion",
    entityId: suggestionId,
    metadata: { title: auth.suggestion.title },
  });
  revalidateCopilot();
  return { success: "Ação atualizada." };
}

/**
 * Transforma uma sugestão em tarefa (execução aprovada pelo gestor).
 * Único efeito operacional da v1 — sempre disparado manualmente.
 */
export async function suggestionToTask(suggestionId: string): Promise<ActionState> {
  const auth = await guardSuggestion(suggestionId);
  if (!auth.ok) return { error: auth.error };
  const s = auth.suggestion;
  if (s.status === "REJEITADA" || s.status === "CANCELADA") return { error: "Sugestão já descartada." };
  if (s.status === "EXECUTADA") return { error: "Esta sugestão já foi executada." };

  const create = await checkPermission("tasks.create");
  if (!create.ok) return { error: create.error };

  const [task] = await db
    .insert(tasks)
    .values({
      title: s.title,
      description: `${s.suggestedAction}\n\n[Origem: Co-piloto — ${s.aiReasoningSummary ?? "sugestão aprovada pelo gestor"}]`,
      type: "OPERACIONAL",
      status: "A_FAZER",
      priority: s.priority,
      clientId: s.clientId,
      digitalAssetId: s.digitalAssetId,
      assignedToId: s.userId,
      createdById: auth.session.userId,
      dueDate: new Date(Date.now() + 2 * 86_400_000),
    })
    .returning();

  await db
    .update(copilotSuggestions)
    .set({
      status: "EXECUTADA",
      resolvedById: auth.session.userId,
      resolvedAt: new Date(),
      executedTaskId: task.id,
    })
    .where(eq(copilotSuggestions.id, suggestionId));
  await logActivity({
    userId: auth.session.userId,
    action: "copilot.suggestionExecuted",
    entityType: "copilotSuggestion",
    entityId: suggestionId,
    metadata: { title: s.title, taskId: task.id, mode: "tarefa" },
  });
  revalidateCopilot();
  revalidatePath("/tarefas");
  return { success: "Tarefa criada a partir da sugestão.", taskId: task.id };
}

// ---------------------------------------------------------------------------
// Ações estruturadas (CopilotAction) — fluxo: revisar → editar → aprovar →
// executar → log. Nada roda sem aprovação explícita.
// ---------------------------------------------------------------------------

async function guardAction(
  actionId: string,
): Promise<
  | { ok: true; session: SessionPayload; action: CopilotAction; suggestion: CopilotSuggestion }
  | { ok: false; error: string }
> {
  const auth = await checkPermission("tasks.view");
  if (!auth.ok) return auth;
  const action = await db.query.copilotActions.findFirst({
    where: eq(copilotActions.id, actionId),
    with: { suggestion: true },
  });
  if (!action) return { ok: false, error: "Ação não encontrada." };
  const suggestion = action.suggestion as CopilotSuggestion;
  if (suggestion.userId !== auth.session.userId && !isAdmin(auth.session)) {
    return { ok: false, error: "Você só pode decidir sobre as ações do seu próprio Co-piloto." };
  }
  return { ok: true, session: auth.session, action, suggestion };
}

/**
 * Aprova E executa uma ação estruturada (passo único, disparado pelo gestor).
 * Sucesso → EXECUTADA (+resultado); falha → FALHOU com erro claro (pode tentar
 * de novo). A sugestão-mãe acompanha o desfecho.
 */
export async function approveAndExecuteAction(actionId: string): Promise<ActionState> {
  const auth = await guardAction(actionId);
  if (!auth.ok) return { error: auth.error };
  const { action, suggestion, session } = auth;
  if (!["PENDENTE", "APROVADA", "FALHOU"].includes(action.status)) {
    return { error: "Esta ação já foi executada ou cancelada." };
  }
  if (suggestion.status === "REJEITADA" || suggestion.status === "CANCELADA") {
    return { error: "A sugestão desta ação foi descartada." };
  }

  // registro da aprovação (antes da execução)
  await db
    .update(copilotActions)
    .set({ status: "APROVADA", approvedById: session.userId, updatedAt: new Date() })
    .where(eq(copilotActions.id, actionId));
  await logActivity({
    userId: session.userId,
    action: "copilot.actionApproved",
    entityType: "copilotAction",
    entityId: actionId,
    metadata: { actionType: action.actionType, suggestionId: suggestion.id },
  });

  const result = await executeCopilotAction(action, suggestion, session);

  if (!result.ok) {
    await db
      .update(copilotActions)
      .set({ status: "FALHOU", errorMessage: result.error, updatedAt: new Date() })
      .where(eq(copilotActions.id, actionId));
    await logActivity({
      userId: session.userId,
      action: "copilot.actionFailed",
      entityType: "copilotAction",
      entityId: actionId,
      metadata: { actionType: action.actionType, error: result.error },
    });
    revalidateCopilot();
    return { error: result.error };
  }

  await db
    .update(copilotActions)
    .set({
      status: "EXECUTADA",
      executedAt: new Date(),
      resultSummary: result.resultSummary,
      resultRef: result.resultRef ?? null,
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(copilotActions.id, actionId));
  await db
    .update(copilotSuggestions)
    .set({ status: "EXECUTADA", resolvedById: session.userId, resolvedAt: new Date() })
    .where(eq(copilotSuggestions.id, suggestion.id));
  await logActivity({
    userId: session.userId,
    action: "copilot.actionExecuted",
    entityType: "copilotAction",
    entityId: actionId,
    metadata: { actionType: action.actionType, suggestionId: suggestion.id, resultRef: result.resultRef },
  });
  revalidateCopilot();
  return { success: result.resultSummary };
}

/** Cancela uma ação pendente (nada é executado). */
export async function cancelCopilotAction(actionId: string): Promise<ActionState> {
  const auth = await guardAction(actionId);
  if (!auth.ok) return { error: auth.error };
  if (!["PENDENTE", "APROVADA", "FALHOU"].includes(auth.action.status)) {
    return { error: "Esta ação já foi executada ou cancelada." };
  }
  await db
    .update(copilotActions)
    .set({ status: "CANCELADA", updatedAt: new Date() })
    .where(eq(copilotActions.id, actionId));
  await logActivity({
    userId: auth.session.userId,
    action: "copilot.actionCancelled",
    entityType: "copilotAction",
    entityId: actionId,
    metadata: { actionType: auth.action.actionType },
  });
  revalidateCopilot();
  return { success: "Ação cancelada — nada foi alterado no sistema." };
}

// campo de texto editável do payload, por tipo de ação
const EDITABLE_FIELD: Record<string, string> = {
  PREPARE_WHATSAPP_MESSAGE: "message",
  SEND_WHATSAPP_MESSAGE_FUTURE: "message",
  CREATE_TASK_COMMENT: "body",
  CREATE_CLIENT_COMMENT: "comment",
  CREATE_REMINDER: "body",
  CREATE_TASK: "description",
};

/** Edita o texto principal do payload antes da aprovação. */
export async function updateActionText(actionId: string, text: string): Promise<ActionState> {
  const auth = await guardAction(actionId);
  if (!auth.ok) return { error: auth.error };
  if (!["PENDENTE", "FALHOU"].includes(auth.action.status)) {
    return { error: "Apenas ações pendentes podem ser editadas." };
  }
  const field = EDITABLE_FIELD[auth.action.actionType];
  if (!field) return { error: "Esta ação não tem texto editável." };
  const clean = text.trim();
  if (clean.length < 3) return { error: "Texto muito curto." };

  await db
    .update(copilotActions)
    .set({ payload: { ...auth.action.payload, [field]: clean }, updatedAt: new Date() })
    .where(eq(copilotActions.id, actionId));
  await logActivity({
    userId: auth.session.userId,
    action: "copilot.actionEdited",
    entityType: "copilotAction",
    entityId: actionId,
    metadata: { actionType: auth.action.actionType, field },
  });
  revalidateCopilot();
  return { success: "Ação atualizada — revise e aprove quando quiser." };
}

// ---------------------------------------------------------------------------
// WhatsApp (integração futura) + escuta simulada
// ---------------------------------------------------------------------------

/**
 * "Conectar WhatsApp": v1 apenas registra a intenção (status NAO_CONECTADO) e
 * informa que a integração oficial está pendente. Sem scraping, sem automação
 * não autorizada — a conexão real virá por provedor oficial, por usuário.
 */
export async function requestWhatsAppConnection(): Promise<ActionState> {
  const auth = await checkPermission("tasks.view");
  if (!auth.ok) return { error: auth.error };

  await db
    .insert(whatsappConnections)
    .values({ userId: auth.session.userId, status: "NAO_CONECTADO", metadata: { requestedAt: new Date().toISOString() } })
    .onConflictDoUpdate({
      target: whatsappConnections.userId,
      set: { updatedAt: new Date(), metadata: { requestedAt: new Date().toISOString() } },
    });
  await logActivity({
    userId: auth.session.userId,
    action: "copilot.whatsappConnectionRequested",
    entityType: "whatsappConnection",
  });
  revalidateCopilot();
  return {
    error:
      "Integração pendente: a conexão oficial com o WhatsApp ainda não está disponível. Sua intenção foi registrada — enquanto isso, use a simulação de resumos colando o texto da conversa.",
  };
}

/** Adiciona um grupo/contato à lista de monitorados (escolha voluntária do usuário). */
export async function addMonitoredConversation(
  displayName: string,
  type: string,
  clientId?: string | null,
): Promise<ActionState> {
  const auth = await checkPermission("tasks.view");
  if (!auth.ok) return { error: auth.error };
  const clean = displayName.trim();
  if (clean.length < 2) return { error: "Informe o nome do grupo/contato." };
  const convType = type === "CONTATO" ? "CONTATO" : "GRUPO";

  await db.insert(monitoredConversations).values({
    userId: auth.session.userId,
    type: convType,
    displayName: clean,
    clientId: clientId || null,
  });
  await logActivity({
    userId: auth.session.userId,
    action: "copilot.conversationAdded",
    entityType: "monitoredConversation",
    metadata: { displayName: clean, type: convType },
  });
  revalidateCopilot();
  return { success: "Conversa adicionada à lista de monitoramento." };
}

export async function toggleMonitoredConversation(conversationId: string): Promise<ActionState> {
  const auth = await checkPermission("tasks.view");
  if (!auth.ok) return { error: auth.error };
  const conv = await db.query.monitoredConversations.findFirst({
    where: and(eq(monitoredConversations.id, conversationId), eq(monitoredConversations.userId, auth.session.userId)),
  });
  if (!conv) return { error: "Conversa não encontrada." };
  await db
    .update(monitoredConversations)
    .set({ isActive: !conv.isActive, updatedAt: new Date() })
    .where(eq(monitoredConversations.id, conversationId));
  revalidateCopilot();
  return { success: conv.isActive ? "Monitoramento pausado." : "Monitoramento reativado." };
}

/**
 * Simula a escuta inteligente: o usuário cola o texto de uma conversa e o
 * sistema gera o resumo (heurístico, v1). Se houver objeções/dúvidas, cria
 * sugestões de resposta — que também exigem aprovação antes de qualquer envio.
 */
export async function simulateConversationSummary(
  conversationId: string | null,
  text: string,
  clientId?: string | null,
): Promise<ActionState> {
  const auth = await checkPermission("tasks.view");
  if (!auth.ok) return { error: auth.error };
  const clean = text.trim();
  if (clean.length < 20) return { error: "Cole ao menos algumas mensagens da conversa (mínimo 20 caracteres)." };

  // conversa alvo: a informada (do próprio usuário) ou uma "Simulação manual"
  let convId = conversationId;
  if (convId) {
    const conv = await db.query.monitoredConversations.findFirst({
      where: and(eq(monitoredConversations.id, convId), eq(monitoredConversations.userId, auth.session.userId)),
    });
    if (!conv) return { error: "Conversa não encontrada." };
  } else {
    const existing = await db.query.monitoredConversations.findFirst({
      where: and(
        eq(monitoredConversations.userId, auth.session.userId),
        eq(monitoredConversations.displayName, "Simulação manual"),
      ),
    });
    if (existing) convId = existing.id;
    else {
      const [conv] = await db
        .insert(monitoredConversations)
        .values({ userId: auth.session.userId, type: "CONTATO", displayName: "Simulação manual", isActive: false })
        .returning();
      convId = conv.id;
    }
  }

  const digest = summarizeConversation(clean);
  await db.insert(conversationSummaries).values({
    conversationId: convId!,
    clientId: clientId || null,
    summary: digest.summary,
    keyPoints: digest.keyPoints,
    objections: digest.objections,
    doubts: digest.doubts,
    pendingActions: digest.pendingActions,
    sentiment: digest.sentiment,
    priority: digest.priority,
    source: "SIMULACAO",
    createdById: auth.session.userId,
  });

  // objeções/dúvidas viram sugestões de resposta com a MENSAGEM PREPARADA como
  // ação estruturada — o gestor edita/aprova antes de qualquer envio
  const newSuggestions: { row: typeof copilotSuggestions.$inferInsert; action?: Omit<typeof copilotActions.$inferInsert, "suggestionId"> }[] = [];
  if (digest.objections.length) {
    newSuggestions.push({
      row: {
        userId: auth.session.userId,
        clientId: clientId || null,
        type: "QUEBRAR_OBJECAO",
        title: "Responder objeção identificada na conversa",
        description: `Objeção: "${digest.objections[0]}"`,
        suggestedAction: "Revisar a resposta preparada (reconhece a preocupação, traz dados e propõe próximo passo) e enviar manualmente.",
        priority: digest.priority,
        status: "PENDENTE",
        source: "REGRAS",
        aiReasoningSummary: "O resumo da conversa identificou objeção do cliente; responder rápido e com dados reduz risco de churn.",
      },
      action: {
        actionType: "PREPARE_WHATSAPP_MESSAGE",
        targetType: "conversation",
        targetId: convId,
        payload: {
          clientId: clientId || null,
          message: `Entendo totalmente a sua preocupação — obrigado por trazer isso. Quero te mostrar os números do período e o que já estamos ajustando para melhorar o resultado. Posso te mandar um resumo ainda hoje e marcarmos 15 minutos para revisar juntos?`,
        },
        status: "PENDENTE",
      },
    });
  }
  if (digest.doubts.length) {
    newSuggestions.push({
      row: {
        userId: auth.session.userId,
        clientId: clientId || null,
        type: "RESPONDER_DUVIDA",
        title: "Responder dúvida em aberto na conversa",
        description: `Dúvida: "${digest.doubts[0]}"`,
        suggestedAction: "Revisar a resposta preparada para a dúvida e enviar manualmente; registrar na ficha se relevante.",
        priority: "MEDIA",
        status: "PENDENTE",
        source: "REGRAS",
        aiReasoningSummary: "Há pergunta do cliente sem resposta registrada; dúvidas paradas geram insatisfação.",
      },
      action: {
        actionType: "PREPARE_WHATSAPP_MESSAGE",
        targetType: "conversation",
        targetId: convId,
        payload: {
          clientId: clientId || null,
          message: `Ótima pergunta! Deixa eu te explicar direitinho: [complete aqui a resposta]. Qualquer coisa me chama que eu detalho com prints/exemplos.`,
        },
        status: "PENDENTE",
      },
    });
  }
  // conversa ainda sem cliente + cliente informado → sugerir o vínculo
  if (clientId) {
    const conv = await db.query.monitoredConversations.findFirst({
      where: eq(monitoredConversations.id, convId!),
      columns: { clientId: true, displayName: true },
    });
    if (conv && !conv.clientId) {
      newSuggestions.push({
        row: {
          userId: auth.session.userId,
          clientId,
          type: "ACOMPANHAR_GRUPO",
          title: `Vincular conversa "${conv.displayName}" ao cliente`,
          suggestedAction: "Vincular esta conversa (e seus resumos) ao cliente para centralizar o histórico.",
          priority: "BAIXA",
          status: "PENDENTE",
          source: "REGRAS",
          aiReasoningSummary: "Você gerou um resumo desta conversa para um cliente, mas a conversa ainda não está vinculada a ele.",
        },
        action: {
          actionType: "LINK_CONVERSATION_TO_CLIENT",
          targetType: "conversation",
          targetId: convId,
          payload: { conversationId: convId, clientId },
          status: "PENDENTE",
        },
      });
    }
  }
  for (const item of newSuggestions) {
    const [created] = await db.insert(copilotSuggestions).values(item.row).returning({ id: copilotSuggestions.id });
    if (item.action) {
      await db.insert(copilotActions).values({ ...item.action, suggestionId: created.id });
    }
  }

  await logActivity({
    userId: auth.session.userId,
    action: "copilot.summarySimulated",
    entityType: "conversationSummary",
    metadata: { conversationId: convId, objections: digest.objections.length, doubts: digest.doubts.length },
  });
  revalidateCopilot();
  return { success: `Resumo gerado${newSuggestions.length ? ` + ${newSuggestions.length} sugestão(ões) de resposta para sua aprovação` : ""}.` };
}
