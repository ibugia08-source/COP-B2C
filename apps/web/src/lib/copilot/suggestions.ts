import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { copilotSuggestions, type CopilotSuggestionType } from "@/db/schema";
import type { ManagerDailyContext } from "./context";

/**
 * Motor de sugestões do Co-piloto (v1: regras determinísticas, source REGRAS).
 * Cada sugestão traz uma justificativa objetiva (aiReasoningSummary) — nunca
 * chain-of-thought — e NUNCA é executada sem aprovação do gestor.
 *
 * Idempotente: usa dedupeKey (tipo:entidade). Se já existe sugestão com a mesma
 * chave (em qualquer status), não recria — rejeitadas não voltam a aparecer.
 */

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
};

function buildRuleSuggestions(ctx: ManagerDailyContext): NewSuggestion[] {
  const out: NewSuggestion[] = [];

  // 1) Clientes críticos → revisão imediata
  for (const c of ctx.criticalClients) {
    out.push({
      type: "REVISAR_CLIENTE_CRITICO",
      title: `Revisar cliente crítico: ${c.name}`,
      description: `Saúde/etapa indicam conta crítica (${c.healthStatus}).`,
      suggestedAction:
        "Revisar a ficha do cliente, validar o plano de ação e registrar uma atualização hoje. Se necessário, agendar reunião de alinhamento.",
      priority: "URGENTE",
      aiReasoningSummary:
        "O cliente está marcado como crítico na plataforma; contas críticas sem revisão frequente têm alto risco de churn.",
      clientId: c.id,
      dedupeKey: `REVISAR_CLIENTE_CRITICO:${c.id}`,
    });
  }

  // 2) Clientes em observação → contato proativo
  for (const c of ctx.observationClients) {
    out.push({
      type: "ENTRAR_EM_CONTATO_COM_CLIENTE",
      title: `Contato proativo: ${c.name}`,
      description: "Cliente em observação — contato preventivo reduz risco de escalada.",
      suggestedAction: `Enviar mensagem de acompanhamento para ${c.name} com um resumo do que foi feito na semana e o próximo passo planejado.`,
      priority: "ALTA",
      aiReasoningSummary:
        "Clientes em observação que recebem contato proativo tendem a estabilizar; a plataforma indica este cliente nesse estado.",
      clientId: c.id,
      dedupeKey: `ENTRAR_EM_CONTATO_COM_CLIENTE:${c.id}`,
    });
  }

  // 3) Tarefas atrasadas de prioridade alta → priorizar
  const urgentOverdue = ctx.overdueTasks.filter((t) => t.priority === "URGENTE" || t.priority === "ALTA");
  for (const t of urgentOverdue.slice(0, 5)) {
    out.push({
      type: "PRIORIZAR_TAREFA",
      title: `Priorizar tarefa atrasada: ${t.title}`,
      description: t.clientName ? `Cliente: ${t.clientName}.` : undefined,
      suggestedAction: "Reservar um bloco de tempo hoje para concluir ou repactuar o prazo desta tarefa.",
      priority: t.priority === "URGENTE" ? "URGENTE" : "ALTA",
      aiReasoningSummary: `A tarefa venceu${t.dueDate ? ` em ${t.dueDate.toLocaleDateString("pt-BR")}` : ""} e tem prioridade ${t.priority.toLowerCase()} — atraso prolongado impacta o cliente.`,
      clientId: t.clientId,
      taskId: t.id,
      dedupeKey: `PRIORIZAR_TAREFA:${t.id}`,
    });
  }

  // 4) Tarefas aguardando equipe/cliente há espera → cobrar resposta
  for (const t of ctx.waitingTeamTasks.slice(0, 5)) {
    out.push({
      type: "COBRAR_RESPOSTA_INTERNA",
      title: `Cobrar resposta: ${t.title}`,
      description: `Tarefa parada em "${t.status === "AGUARDANDO_EQUIPE" ? "aguardando equipe" : "aguardando cliente"}".`,
      suggestedAction:
        t.status === "AGUARDANDO_EQUIPE"
          ? "Cobrar a pessoa responsável internamente e registrar a resposta na tarefa."
          : "Fazer follow-up com o cliente sobre a pendência e registrar o retorno na tarefa.",
      priority: "MEDIA",
      aiReasoningSummary: "A tarefa está bloqueada esperando terceiros; sem cobrança ativa, tende a ficar parada.",
      clientId: t.clientId,
      taskId: t.id,
      dedupeKey: `COBRAR_RESPOSTA_INTERNA:${t.id}`,
    });
  }

  // 5) Ativos bloqueados → criar tarefa de desbloqueio
  for (const a of ctx.blockedDigitalAssets.slice(0, 5)) {
    out.push({
      type: "CRIAR_TAREFA",
      title: `Tratar ativo bloqueado: ${a.title}`,
      description: a.clientName ? `Cliente: ${a.clientName}.` : "Ativo interno da agência.",
      suggestedAction: `Criar tarefa "Desbloquear ${a.title}" com os passos de recurso/documentação e prazo de 2 dias.`,
      priority: "ALTA",
      aiReasoningSummary: "Ativo bloqueado interrompe a operação (anúncios/acessos); formalizar o desbloqueio como tarefa garante acompanhamento.",
      clientId: a.clientId,
      digitalAssetId: a.id,
      dedupeKey: `CRIAR_TAREFA:asset:${a.id}`,
    });
  }

  // 6) Reunião nas próximas 24h → preparar pauta
  const soon = ctx.upcomingMeetings.filter((m) => m.meetingDate.getTime() - ctx.date.getTime() < 24 * 3_600_000);
  for (const m of soon.slice(0, 3)) {
    out.push({
      type: "PREPARAR_RELATORIO",
      title: `Preparar reunião: ${m.clientName}`,
      description: `"${m.title}" em ${m.meetingDate.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}.`,
      suggestedAction: "Montar a pauta com resultados recentes, pendências e próximos passos antes da reunião.",
      priority: "ALTA",
      aiReasoningSummary: "Há reunião agendada em menos de 24h; chegar com pauta e dados aumenta a percepção de valor.",
      clientId: m.clientId,
      dedupeKey: `PREPARAR_RELATORIO:meeting:${m.id}`,
    });
  }

  return out;
}

/**
 * Gera as sugestões do dia para o gestor (idempotente). Retorna quantas foram
 * criadas. Chamada segura a cada carregamento da página do Co-piloto.
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

  await db.insert(copilotSuggestions).values(
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
  );
  return fresh.length;
}
