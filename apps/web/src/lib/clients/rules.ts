import { ADS_STATUSES, AGENCY_BRANDS, BUSINESS_MODELS, HEALTH_STATUSES } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { canAccessClient } from "@/lib/auth/ownership";
import type { PermissionKey } from "@/lib/auth/permissions";
import type { SessionPayload } from "@/lib/auth/session";

/**
 * Fonte única das regras de negócio do cliente.
 *
 * Antes, estas regras estavam copiadas (com critérios divergentes) entre
 * clientes/actions.ts e operacao/actions.ts. Centralizar aqui garante um único
 * dono e um único critério para cada regra.
 */

const MIN_REASON_LENGTH = 5;

/**
 * Gate de ownership: escrever num cliente exige ser um dos responsáveis
 * (estrategista, gestores, responsável principal). OWNER/ADMIN operam tudo.
 * Negações são registradas em activityLogs. Retorna `{ error }` para bloquear
 * ou `null` para liberar.
 */
export async function denyClientOutOfScope(
  session: SessionPayload,
  clientId: string,
  action: string,
  allKey: PermissionKey = "clients.update",
): Promise<{ error: string } | null> {
  if (await canAccessClient(session, clientId, allKey)) return null;
  await logActivity({
    userId: session.userId,
    action: "client.ownershipDenied",
    entityType: "client",
    entityId: clientId,
    metadata: { action, reason: "ownership_scope" },
  });
  return { error: "Você não é responsável por este cliente." };
}

/**
 * Saúde CRÍTICA exige uma observação/motivo (mínimo 5 caracteres). Critério
 * único para criação, edição e mudança de saúde. Retorna a mensagem de erro ou
 * `null` se a regra estiver satisfeita.
 */
export function assertCriticalNeedsNote(
  healthStatus: string,
  note: string | null | undefined,
): string | null {
  if (healthStatus !== "CRITICO") return null;
  if (!note || note.trim().length < MIN_REASON_LENGTH) {
    return "Cliente com saúde CRÍTICA exige uma observação explicando o motivo (mínimo 5 caracteres).";
  }
  return null;
}

/**
 * Marcar como PERDIDO exige motivo de churn (mínimo 5 caracteres) e data da
 * perda. Retorna a mensagem de erro ou `null`.
 */
export function assertChurn(
  reason: string | null | undefined,
  date: string | null | undefined,
): string | null {
  if (!reason || reason.trim().length < MIN_REASON_LENGTH) {
    return "Informe o motivo do churn (mínimo 5 caracteres).";
  }
  if (!date) return "Informe a data da perda.";
  return null;
}

// `status` NÃO está aqui de propósito: é derivado (ver lib/clients/state.ts),
// nunca editado à mão.
/** Enums aceitos por campo na edição inline/rápida da lista de clientes. */
export const CLIENT_FIELD_ENUM: Record<string, readonly string[]> = {
  agencyBrand: AGENCY_BRANDS,
  businessModel: BUSINESS_MODELS,
  healthStatus: HEALTH_STATUSES,
  adsStatus: ADS_STATUSES,
};

/** Campos editáveis inline na lista de clientes. */
export const EDITABLE_CLIENT_FIELDS = new Set([
  "agencyBrand",
  "businessModel",
  "niche",
  "healthStatus",
  "adsStatus",
  "trafficManager1Id",
]);
