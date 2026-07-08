/**
 * Resumo heurístico de conversas (v1 — sem IA externa). Recebe texto colado
 * voluntariamente pelo usuário e extrai síntese objetiva: pontos-chave,
 * objeções, dúvidas, pendências, sentimento e prioridade.
 *
 * Quando a integração oficial de WhatsApp existir, esta função poderá ser
 * substituída por um modelo de linguagem — mantendo o mesmo contrato.
 */

export type ConversationDigest = {
  summary: string;
  keyPoints: string[];
  objections: string[];
  doubts: string[];
  pendingActions: string[];
  sentiment: "POSITIVO" | "NEUTRO" | "NEGATIVO";
  priority: "BAIXA" | "MEDIA" | "ALTA" | "URGENTE";
};

const OBJECTION_RX = /caro|preço|valor alto|não vejo resultado|sem resultado|cancelar|pausar|concorrente|insatisfeit|não está funcionando|desist/i;
const PENDING_RX = /enviar|mandar|agendar|marcar|preciso que|pode fazer|vou providenciar|até (amanhã|segunda|terça|quarta|quinta|sexta)|prazo|aguardo|fico no aguardo|me retorna/i;
const NEGATIVE_RX = /cancelar|insatisfeit|péssimo|ruim|decepcion|reclama|problema sério|urgente/i;
const POSITIVE_RX = /obrigad|ótimo|excelente|parabéns|fechado|perfeito|adorei|gostei|vamos em frente/i;
const URGENT_RX = /urgente|cancelar|bloquead|hoje sem falta|imediat/i;

export function summarizeConversation(text: string): ConversationDigest {
  const lines = text
    .split(/\n+/)
    .map((l) => l.replace(/^\[?\d{1,2}[:/]\d{2}.*?\]?\s*[-–]?\s*/, "").trim()) // remove timestamps comuns
    .filter((l) => l.length > 2);

  const doubts = lines.filter((l) => l.includes("?")).slice(0, 5);
  const objections = lines.filter((l) => OBJECTION_RX.test(l)).slice(0, 5);
  // uma linha pode ser dúvida E pendência ("Pode enviar o relatório até sexta?")
  const pendingActions = lines.filter((l) => PENDING_RX.test(l)).slice(0, 5);

  // pontos-chave: primeiras linhas relevantes que não são dúvida/objeção
  const used = new Set([...doubts, ...objections, ...pendingActions]);
  const keyPoints = lines.filter((l) => !used.has(l) && l.length > 15).slice(0, 4);

  const negative = objections.length >= 2 || NEGATIVE_RX.test(text);
  const positive = !negative && POSITIVE_RX.test(text) && objections.length === 0;
  const sentiment = negative ? "NEGATIVO" : positive ? "POSITIVO" : "NEUTRO";

  const priority = URGENT_RX.test(text)
    ? "URGENTE"
    : objections.length > 0
      ? "ALTA"
      : pendingActions.length > 0
        ? "MEDIA"
        : "BAIXA";

  const parts: string[] = [];
  parts.push(`Conversa com ${lines.length} mensagem(ns) analisada(s).`);
  if (objections.length) parts.push(`${objections.length} objeção(ões) identificada(s).`);
  if (doubts.length) parts.push(`${doubts.length} dúvida(s) em aberto.`);
  if (pendingActions.length) parts.push(`${pendingActions.length} pendência(s) de ação.`);
  if (!objections.length && !doubts.length && !pendingActions.length) {
    parts.push("Sem objeções, dúvidas ou pendências evidentes.");
  }
  parts.push(`Sentimento geral: ${sentiment.toLowerCase()}.`);

  return {
    summary: parts.join(" "),
    keyPoints,
    objections,
    doubts,
    pendingActions,
    sentiment,
    priority,
  };
}
