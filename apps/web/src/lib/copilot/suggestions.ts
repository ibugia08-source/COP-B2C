import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  copilotActions,
  copilotSuggestions,
  type CopilotActionType,
  type CopilotSuggestionType,
} from "@/db/schema";
import type { ManagerDailyContext } from "./context";

/**
 * Motor de sugestões do Co-piloto (v1: regras determinísticas, source REGRAS).
 * Cada sugestão traz justificativa objetiva (aiReasoningSummary) — nunca
 * chain-of-thought — e pode vir com uma AÇÃO ESTRUTURADA anexada: o que o
 * sistema fará QUANDO (e só quando) o gestor aprovar e mandar executar.
 *
 * Idempotente: usa dedupeKey (tipo:entidade). Se já existe sugestão com a mesma
 * chave (em qualquer status), não recria — rejeitadas não voltam a aparecer.
 */

type NewAction = {
  actionType: CopilotActionType;
  targetType: string;
  targetId?: string | null;
  payload: Record<string, unknown>;
};

type NewSuggestion = {
  type: CopilotSuggestionType;
  title: string;
  description?: string;
  suggestedAction: string;
  priority: "BAIXA" | "MEDIA" | "ALTA" | "URGENTE";
  aiReasoningSummary: string;
  clientId?: string | null;
  taskId?: string | null;
  digitalAssetId?: string | null;
  dedupeKey: string;
  action?: NewAction;
};

function buildRuleSuggestions(ctx: ManagerDailyContext): NewSuggestion[] {
  const out: NewSuggestion[] = [];

  // 1) Clientes críticos → revisão + plano de ação gerado como documento
  for (const c of ctx.criticalClients) {
    out.push({
      type: "REVISAR_CLIENTE_CRITICO",
      title: `Revisar cliente crítico: ${c.name}`,
      description: `Saúde/etapa indicam conta crítica (${c.healthStatus}).`,
      suggestedAction:
        "Gerar um plano de ação com os dados da plataforma (tarefas, ativos, reuniões) e revisá-lo com o time hoje.",
      priority: "URGENTE",
      aiReasoningSummary:
        "O cliente está marcado como crítico na plataforma; contas críticas sem revisão frequente têm alto risco de churn.",
      clientId: c.id,
      dedupeKey: `REVISAR_CLIENTE_CRITICO:${c.id}`,
      action: {
        actionType: "GENERATE_REPORT",
        targetType: "client",
        targetId: c.id,
        payload: { clientId: c.id, kind: "PLANO_ACAO" },
      },
    });
  }

  // 2) Clientes em observação → contato proativo com mensagem preparada
  for (const c of ctx.observationClients) {
    out.push({
      type: "ENTRAR_EM_CONTATO_COM_CLIENTE",
      title: `Contato proativo: ${c.name}`,
      description: "Cliente em observação — contato preventivo reduz risco de escalada.",
      suggestedAction: `Revisar e enviar a mensagem preparada para ${c.name} (edite antes de aprovar, se quiser).`,
      priority: "ALTA",
      aiReasoningSummary:
        "Clientes em observação que recebem contato proativo tendem a estabilizar; a plataforma indica este cliente nesse estado.",
      clientId: c.id,
      dedupeKey: `ENTRAR_EM_CONTATO_COM_CLIENTE:${c.id}`,
      action: {
        actionType: "PREPARE_WHATSAPP_MESSAGE",
        targetType: "client",
        targetId: c.id,
        payload: {
          clientId: c.id,
          message: `Olá! Passando para dar visibilidade do que avançamos esta semana na conta da ${c.name} e alinhar o próximo passo. Podemos falar hoje ou amanhã? Qual horário fica melhor?`,
        },
      },
    });
  }

  // 3) Tarefas atrasadas de prioridade alta → priorizar (ação real na tarefa)
  const urgentOverdue = ctx.overdueTasks.filter((t) => t.priority === "URGENTE" || t.priority === "ALTA");
  for (const t of urgentOverdue.slice(0, 5)) {
    const alreadyUrgent = t.priority === "URGENTE";
    out.push({
      type: "PRIORIZAR_TAREFA",
      title: `Priorizar tarefa atrasada: ${t.title}`,
      description: t.clientName ? `Cliente: ${t.clientName}.` : undefined,
      suggestedAction: alreadyUrgent
        ? "Mover a tarefa para Em andamento e reservar um bloco de tempo hoje para concluí-la."
        : "Elevar a prioridade para URGENTE e tratar hoje.",
      priority: alreadyUrgent ? "URGENTE" : "ALTA",
      aiReasoningSummary: `A tarefa venceu${t.dueDate ? ` em ${t.dueDate.toLocaleDateString("pt-BR")}` : ""} e tem prioridade ${t.priority.toLowerCase()} — atraso prolongado impacta o cliente.`,
      clientId: t.clientId,
      taskId: t.id,
      dedupeKey: `PRIORIZAR_TAREFA:${t.id}`,
      action: alreadyUrgent
        ? { actionType: "UPDATE_TASK_STATUS", targetType: "task", targetId: t.id, payload: { taskId: t.id, status: "EM_ANDAMENTO" } }
        : { actionType: "UPDATE_TASK_PRIORITY", targetType: "task", targetId: t.id, payload: { taskId: t.id, priority: "URGENTE" } },
    });
  }

  // 4) Tarefas aguardando equipe/cliente → cobrar resposta (comentário na tarefa)
  for (const t of ctx.waitingTeamTasks.slice(0, 5)) {
    const internal = t.status === "AGUARDANDO_EQUIPE";
    out.push({
      type: "COBRAR_RESPOSTA_INTERNA",
      title: `Cobrar resposta: ${t.title}`,
      description: `Tarefa parada em "${internal ? "aguardando equipe" : "aguardando cliente"}".`,
      suggestedAction: "Registrar cobrança na tarefa (comentário) e acionar a pessoa responsável.",
      priority: "MEDIA",
      aiReasoningSummary: "A tarefa está bloqueada esperando terceiros; sem cobrança ativa, tende a ficar parada.",
      clientId: t.clientId,
      taskId: t.id,
      dedupeKey: `COBRAR_RESPOSTA_INTERNA:${t.id}`,
      action: {
        actionType: "CREATE_TASK_COMMENT",
        targetType: "task",
        targetId: t.id,
        payload: {
          taskId: t.id,
          body: internal
            ? "⏰ Cobrança do Co-piloto (aprovada pelo gestor): esta tarefa está aguardando resposta da equipe. Quem está com a bola, por favor atualize aqui."
            : "⏰ Follow-up (aprovado pelo gestor): tarefa aguardando retorno do cliente. Registrar aqui a resposta assim que chegar.",
        },
      },
    });
  }

  // 5) Ativos bloqueados → criar tarefa de desbloqueio
  for (const a of ctx.blockedDigitalAssets.slice(0, 5)) {
    out.push({
      type: "CRIAR_TAREFA",
      title: `Tratar ativo bloqueado: ${a.title}`,
      description: a.clientName ? `Cliente: ${a.clientName}.` : "Ativo interno da agência.",
      suggestedAction: `Criar a tarefa "Desbloquear ${a.title}" com prazo de 2 dias.`,
      priority: "ALTA",
      aiReasoningSummary: "Ativo bloqueado interrompe a operação (anúncios/acessos); formalizar o desbloqueio como tarefa garante acompanhamento.",
      clientId: a.clientId,
      digitalAssetId: a.id,
      dedupeKey: `CRIAR_TAREFA:asset:${a.id}`,
      action: {
        actionType: "CREATE_TASK",
        targetType: "digitalAsset",
        targetId: a.id,
        payload: {
          title: `Desbloquear ${a.title}`,
          description: "Abrir recurso/verificação, reunir documentos e registrar o andamento no ativo.",
          clientId: a.clientId,
          digitalAssetId: a.id,
          priority: "ALTA",
          dueDays: 2,
        },
      },
    });
  }

  // 6) Ativos precisando de documentos → tarefa de envio de documentos
  for (const a of ctx.assetsNeedingDocs.slice(0, 5)) {
    out.push({
      type: "CRIAR_TAREFA",
      title: `Enviar documentos: ${a.title}`,
      description: a.clientName ? `Cliente: ${a.clientName}.` : "Ativo interno da agência.",
      suggestedAction: `Criar a tarefa "Enviar documentos — ${a.title}" e solicitar os documentos ao cliente.`,
      priority: "ALTA",
      aiReasoningSummary: "O ativo está parado aguardando documentos; sem tarefa formal, a pendência se perde.",
      clientId: a.clientId,
      digitalAssetId: a.id,
      dedupeKey: `CRIAR_TAREFA:docs:${a.id}`,
      action: {
        actionType: "CREATE_TASK",
        targetType: "digitalAsset",
        targetId: a.id,
        payload: {
          title: `Enviar documentos — ${a.title}`,
          description: "Levantar quais documentos a plataforma exige, solicitar ao cliente e anexar ao ativo.",
          clientId: a.clientId,
          digitalAssetId: a.id,
          priority: "ALTA",
          dueDays: 3,
        },
      },
    });
  }

  // 7) Reunião nas próximas 24h → gerar resumo do cliente para a pauta
  const soon = ctx.upcomingMeetings.filter((m) => m.meetingDate.getTime() - ctx.date.getTime() < 24 * 3_600_000);
  for (const m of soon.slice(0, 3)) {
    out.push({
      type: "PREPARAR_RELATORIO",
      title: `Preparar reunião: ${m.clientName}`,
      description: `"${m.title}" em ${m.meetingDate.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}.`,
      suggestedAction: "Gerar o resumo operacional do cliente (tarefas, pendências, ativos) para usar como pauta.",
      priority: "ALTA",
      aiReasoningSummary: "Há reunião agendada em menos de 24h; chegar com pauta e dados aumenta a percepção de valor.",
      clientId: m.clientId,
      dedupeKey: `PREPARAR_RELATORIO:meeting:${m.id}`,
      action: {
        actionType: "GENERATE_REPORT",
        targetType: "client",
        targetId: m.clientId,
        payload: { clientId: m.clientId, kind: "RESUMO" },
      },
    });
  }

  return out;
}

/**
 * Gera as sugestões do dia para o gestor (idempotente), anexando as ações
 * estruturadas. Retorna quantas foram criadas.
 */
export async function syncCopilotSuggestions(ctx: ManagerDailyContext): Promise<number> {
  const candidates = buildRuleSuggestions(ctx);
  if (!candidates.length) return 0;

  const keys = candidates.map((c) => c.dedupeKey);
  const existing = await db
    .select({ dedupeKey: copilotSuggestions.dedupeKey })
    .from(copilotSuggestions)
    .where(and(eq(copilotSuggestions.userId, ctx.userId), inArray(copilotSuggestions.dedupeKey, keys)));
  const seen = new Set(existing.map((e) => e.dedupeKey));

  const fresh = candidates.filter((c) => !seen.has(c.dedupeKey));
  if (!fresh.length) return 0;

  const inserted = await db
    .insert(copilotSuggestions)
    .values(
      fresh.map((c) => ({
        userId: ctx.userId,
        clientId: c.clientId ?? null,
        taskId: c.taskId ?? null,
        digitalAssetId: c.digitalAssetId ?? null,
        type: c.type,
        title: c.title,
        description: c.description ?? null,
        suggestedAction: c.suggestedAction,
        priority: c.priority,
        status: "PENDENTE" as const,
        source: "REGRAS" as const,
        aiReasoningSummary: c.aiReasoningSummary,
        dedupeKey: c.dedupeKey,
      })),
    )
    .returning({ id: copilotSuggestions.id, dedupeKey: copilotSuggestions.dedupeKey });

  // anexa as ações estruturadas às sugestões recém-criadas
  const idByKey = new Map(inserted.map((s) => [s.dedupeKey, s.id]));
  const actionRows = fresh
    .filter((c) => c.action)
    .map((c) => ({
      suggestionId: idByKey.get(c.dedupeKey)!,
      actionType: c.action!.actionType,
      targetType: c.action!.targetType,
      targetId: c.action!.targetId ?? null,
      payload: c.action!.payload,
      status: "PENDENTE" as const,
    }))
    .filter((a) => a.suggestionId);
  if (actionRows.length) await db.insert(copilotActions).values(actionRows);

  return fresh.length;
}
