import type { Tone } from "@/lib/labels";

export const SUGGESTION_TYPE_LABELS: Record<string, string> = {
  ENTRAR_EM_CONTATO_COM_CLIENTE: "Contato com cliente",
  REVISAR_CLIENTE_CRITICO: "Revisar cliente crítico",
  COBRAR_RESPOSTA_INTERNA: "Cobrar resposta",
  PRIORIZAR_TAREFA: "Priorizar tarefa",
  CRIAR_TAREFA: "Criar tarefa",
  ALTERAR_STATUS_CLIENTE: "Alterar status do cliente",
  ALTERAR_SAUDE_CLIENTE: "Alterar saúde do cliente",
  GERAR_RESUMO: "Gerar resumo",
  PREPARAR_RELATORIO: "Preparar relatório/pauta",
  RESPONDER_DUVIDA: "Responder dúvida",
  QUEBRAR_OBJECAO: "Quebrar objeção",
  ACOMPANHAR_GRUPO: "Acompanhar grupo",
  OUTRO: "Outro",
};

export const SUGGESTION_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  PENDENTE: { label: "Pendente", tone: "amber" },
  APROVADA: { label: "Aprovada", tone: "blue" },
  REJEITADA: { label: "Rejeitada", tone: "red" },
  EXECUTADA: { label: "Executada", tone: "green" },
  CANCELADA: { label: "Cancelada", tone: "zinc" },
};

export const SENTIMENT_META: Record<string, { label: string; tone: Tone }> = {
  POSITIVO: { label: "Positivo", tone: "green" },
  NEUTRO: { label: "Neutro", tone: "zinc" },
  NEGATIVO: { label: "Negativo", tone: "red" },
};

export const WHATSAPP_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  NAO_CONECTADO: { label: "Não conectado", tone: "zinc" },
  CONECTANDO: { label: "Conectando", tone: "amber" },
  CONECTADO: { label: "Conectado", tone: "green" },
  ERRO: { label: "Erro", tone: "red" },
  DESCONECTADO: { label: "Desconectado", tone: "zinc" },
};
