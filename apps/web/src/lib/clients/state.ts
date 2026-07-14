import type { ClientStatus, HealthStatus, PipelineStage } from "@/db/schema";

/**
 * Fonte única do "estado do cliente".
 *
 * O estado mora em eixos ortogonais, cada um com um dono:
 *   - pipelineStage: a posição na esteira (Operação)
 *   - healthStatus: o sinal de qualidade (saúde da conta)
 *   - isPaused: pausa comercial, sem perder a posição na esteira
 *   - adsStatus: fato da campanha (independente)
 *
 * `status` (o rótulo macro/comercial) NÃO é editado à mão: é sempre DERIVADO
 * destes eixos por deriveClientStatus. Isto substitui o antigo STAGE_TO_STATUS
 * espalhado, garantindo que nunca haja incoerência entre os campos.
 */

// Mapa etapa da esteira → estágio macro do ciclo de vida (quando não há
// override de perdido/pausado/risco). Etapas de implantação viram IMPLANTACAO.
const STAGE_TO_LIFECYCLE: Record<string, ClientStatus> = {
  NOVO_CLIENTE: "ONBOARDING",
  CRIACAO_DE_GRUPO: "IMPLANTACAO",
  INTEGRACAO_META: "IMPLANTACAO",
  INTEGRACAO_GOOGLE: "IMPLANTACAO",
  PESQUISA_DE_MERCADO: "IMPLANTACAO",
  DIAGNOSTICO_ESTRATEGICO: "IMPLANTACAO",
  ESTUDO_DE_FUNIL: "IMPLANTACAO",
  INTEGRACAO_SOCIAL_MEDIA: "IMPLANTACAO",
  CRM: "IMPLANTACAO",
  BASE_DE_CLIENTES: "ATIVO",
};

export type ClientStateInputs = {
  pipelineStage: PipelineStage | string;
  healthStatus: HealthStatus | string;
  isPaused: boolean;
};

/**
 * Deriva o `status` macro a partir dos eixos canônicos.
 * Precedência: PERDIDO > PAUSADO > EM_RISCO (saúde crítica) > mapeado-da-etapa.
 */
export function deriveClientStatus(input: ClientStateInputs): ClientStatus {
  if (input.pipelineStage === "CLIENTE_PERDIDO") return "PERDIDO";
  if (input.isPaused) return "PAUSADO";
  if (input.healthStatus === "CRITICO") return "EM_RISCO";
  return STAGE_TO_LIFECYCLE[input.pipelineStage] ?? "IMPLANTACAO";
}
