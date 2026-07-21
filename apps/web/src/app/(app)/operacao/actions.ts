"use server";

import { and, asc, eq, max, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  HEALTH_STATUSES,
  clientHealthLogs,
  clients,
  PIPELINE_STAGES,
  type HealthStatus,
  type PipelineStage,
} from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { checkPermission } from "@/lib/auth/guard";
import { emitEvent } from "@/lib/automations/engine";
import { assertChurn, denyClientOutOfScope } from "@/lib/clients/rules";
import { deriveClientStatus } from "@/lib/clients/state";
import { isValidOptionValue } from "@/lib/config-options";
import { cascadeSafeDelete } from "@/lib/safe-delete";

export type MoveResult = { error?: string; success?: string; requires?: "PERDIDO" | "CRITICO" };
export type BulkResult = { ok: number; fail: number; error?: string; success?: string };

export async function moveClientStage(
  clientId: string,
  toStageInput: string,
  extras?: {
    churnReason?: string;
    churnDate?: string;
  },
): Promise<MoveResult> {
  const auth = await checkPermission("clients.moveStatus");
  if (!auth.ok) return { error: auth.error };
  // etapa válida = enum do sistema OU coluna criada pelo admin (essas não têm regras especiais)
  if (
    !(PIPELINE_STAGES as readonly string[]).includes(toStageInput) &&
    !(await isValidOptionValue("operation", "pipeline", toStageInput))
  ) {
    return { error: "Etapa inválida." };
  }
  const toStage = toStageInput as PipelineStage;

  const client = await db.query.clients.findFirst({ where: eq(clients.id, clientId) });
  if (!client) return { error: "Cliente não encontrado." };
  if (client.pipelineStage === toStage) return { success: "Cliente já está nesta etapa." };

  const denied = await denyClientOutOfScope(auth.session, clientId, "moveClientStage", "clients.moveStatus");
  if (denied) return denied;

  // Única etapa com regra obrigatória: perder exige motivo/data de churn.
  if (toStage === "CLIENTE_PERDIDO") {
    const churnError = assertChurn(extras?.churnReason, extras?.churnDate);
    if (churnError) return { requires: "PERDIDO", error: churnError };
  }

  const fromStage = client.pipelineStage;
  // status é sempre derivado dos eixos canônicos (fonte única).
  const status = deriveClientStatus({
    pipelineStage: toStage,
    healthStatus: client.healthStatus,
    isPaused: client.isPaused,
  });
  // card movido de coluna entra no fim da coluna destino (maior boardOrder + 10)
  const [agg] = await db.select({ m: max(clients.boardOrder) }).from(clients);
  const updates: Partial<typeof clients.$inferInsert> = {
    pipelineStage: toStage,
    status,
    boardOrder: (agg?.m ?? 0) + 10,
  };
  if (toStage === "CLIENTE_PERDIDO") {
    updates.churnReason = extras!.churnReason!.trim();
    updates.churnDate = extras!.churnDate!;
  }

  await db.update(clients).set(updates).where(eq(clients.id, clientId));

  await logActivity({
    userId: auth.session.userId,
    action: "client.stageChanged",
    entityType: "client",
    entityId: clientId,
    metadata: { from: fromStage, to: toStage },
  });
  if (status !== client.status) {
    await logActivity({
      userId: auth.session.userId,
      action: "client.statusChanged",
      entityType: "client",
      entityId: clientId,
      metadata: { from: client.status, to: status },
    });
  }

  await emitEvent("CLIENT_STAGE_CHANGED", {
    clientId,
    fromStage,
    toStage,
    actorId: auth.session.userId,
  });
  if (toStage === "CLIENTE_PERDIDO") {
    await emitEvent("CLIENT_MARKED_LOST", { clientId, actorId: auth.session.userId });
  }

  revalidatePath("/operacao");
  revalidatePath("/clientes");
  revalidatePath(`/clientes/${clientId}`);
  return { success: "Cliente movido de etapa." };
}

/**
 * Reordena um cliente DENTRO da sua coluna do Kanban (drag-and-drop).
 * `beforeClientId` = id do card antes do qual inserir; null = fim da coluna.
 * Não muda a etapa (mudança de coluna é feita por moveClientStage).
 */
export async function reorderClientOnBoard(
  clientId: string,
  beforeClientId: string | null,
): Promise<MoveResult> {
  const auth = await checkPermission("clients.moveStatus");
  if (!auth.ok) return { error: auth.error };
  if (clientId === beforeClientId) return { success: "Sem mudança." };

  const client = await db.query.clients.findFirst({
    where: eq(clients.id, clientId),
    columns: { id: true, pipelineStage: true },
  });
  if (!client) return { error: "Cliente não encontrado." };

  const denied = await denyClientOutOfScope(auth.session, clientId, "reorderClientOnBoard", "clients.moveStatus");
  if (denied) return denied;

  // demais cards da mesma coluna, na ordem atual
  const col = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.pipelineStage, client.pipelineStage), ne(clients.id, clientId)))
    .orderBy(asc(clients.boardOrder), asc(clients.createdAt));

  const idx = beforeClientId ? col.findIndex((c) => c.id === beforeClientId) : -1;
  const insertAt = idx < 0 ? col.length : idx;
  const orderedIds = [
    ...col.slice(0, insertAt).map((c) => c.id),
    clientId,
    ...col.slice(insertAt).map((c) => c.id),
  ];

  // renumera a coluna inteira num único UPDATE (VALUES), com folga de 10
  const values = sql.join(
    orderedIds.map((id, i) => sql`(${id}::text, ${(i + 1) * 10}::int)`),
    sql`, `,
  );
  await db.execute(
    sql`UPDATE "clients" AS c SET "board_order" = v.ord FROM (VALUES ${values}) AS v(id, ord) WHERE c.id = v.id`,
  );

  revalidatePath("/operacao");
  return { success: "Ordem atualizada." };
}

// ---------------------------------------------------------------------------
// Exclusão e ações em massa de clientes (seleção no Kanban/Lista)
// ---------------------------------------------------------------------------

/** Exclui um cliente definitivamente (FK-safe). Guardado por clients.delete. */
export async function deleteClient(clientId: string): Promise<MoveResult> {
  const auth = await checkPermission("clients.delete");
  if (!auth.ok) return { error: auth.error };
  const client = await db.query.clients.findFirst({ where: eq(clients.id, clientId) });
  if (!client) return { error: "Cliente não encontrado." };
  const denied = await denyClientOutOfScope(auth.session, clientId, "deleteClient", "clients.delete");
  if (denied) return denied;
  try {
    await cascadeSafeDelete("clients", clientId);
  } catch {
    return { error: "Não foi possível excluir este cliente com segurança. Marque-o como perdido ou pausado." };
  }
  await logActivity({
    userId: auth.session.userId,
    action: "client.deleted",
    entityType: "client",
    entityId: clientId,
    metadata: { name: client.name },
  });
  revalidatePath("/operacao");
  revalidatePath("/clientes");
  return { success: "Cliente excluído." };
}

export async function bulkDeleteClients(ids: string[]): Promise<BulkResult> {
  const auth = await checkPermission("clients.delete");
  if (!auth.ok) return { ok: 0, fail: 0, error: auth.error };
  let ok = 0;
  for (const id of ids) {
    if (await denyClientOutOfScope(auth.session, id, "bulkDeleteClients", "clients.delete")) continue;
    try {
      await cascadeSafeDelete("clients", id);
      ok++;
    } catch {
      // pula clientes que não podem ser removidos com segurança
    }
  }
  await logActivity({ userId: auth.session.userId, action: "client.bulkDeleted", entityType: "client", metadata: { count: ok } });
  revalidatePath("/operacao");
  revalidatePath("/clientes");
  return {
    ok,
    fail: ids.length - ok,
    success: `${ok} cliente(s) excluído(s).${ids.length - ok ? ` ${ids.length - ok} não puderam ser removidos.` : ""}`,
  };
}

/** Move vários clientes de etapa. Perder exige motivo, então é bloqueado em massa. */
export async function bulkMoveClients(ids: string[], stage: string): Promise<BulkResult> {
  const auth = await checkPermission("clients.moveStatus");
  if (!auth.ok) return { ok: 0, fail: 0, error: auth.error };
  if (stage === "CLIENTE_PERDIDO") {
    return { ok: 0, fail: 0, error: "Mover para Perdido exige motivo de churn — faça individualmente." };
  }
  if (
    !(PIPELINE_STAGES as readonly string[]).includes(stage) &&
    !(await isValidOptionValue("operation", "pipeline", stage))
  ) {
    return { ok: 0, fail: 0, error: "Etapa inválida." };
  }
  let ok = 0;
  for (const id of ids) {
    const result = await moveClientStage(id, stage);
    if (result.success) ok++;
  }
  revalidatePath("/operacao");
  revalidatePath("/clientes");
  return { ok, fail: ids.length - ok, success: `${ok} cliente(s) movido(s).` };
}

/** Edição em massa: define gestor principal e/ou saúde (exceto CRÍTICO, que exige motivo). */
export async function bulkEditClients(
  ids: string[],
  patch: { trafficManager1Id?: string | null; healthStatus?: string },
): Promise<BulkResult> {
  const auth = await checkPermission("clients.update");
  if (!auth.ok) return { ok: 0, fail: 0, error: auth.error };
  const set: Partial<typeof clients.$inferInsert> = {};
  if (patch.trafficManager1Id !== undefined) set.trafficManager1Id = patch.trafficManager1Id || null;
  if (patch.healthStatus) {
    if (patch.healthStatus === "CRITICO") {
      return { ok: 0, fail: 0, error: "Saúde CRÍTICA exige motivo — faça individualmente." };
    }
    if (!(HEALTH_STATUSES as readonly string[]).includes(patch.healthStatus)) {
      return { ok: 0, fail: 0, error: "Saúde inválida." };
    }
    set.healthStatus = patch.healthStatus as HealthStatus;
  }
  if (Object.keys(set).length === 0) return { ok: 0, fail: 0, error: "Nada para editar." };

  let ok = 0;
  for (const id of ids) {
    const existing = await db.query.clients.findFirst({ where: eq(clients.id, id) });
    if (!existing) continue;
    if (await denyClientOutOfScope(auth.session, id, "bulkEditClients")) continue;
    // saúde é eixo do status derivado — recomputa por cliente (etapa/pausa variam)
    const perClientSet = set.healthStatus
      ? {
          ...set,
          status: deriveClientStatus({
            pipelineStage: existing.pipelineStage,
            healthStatus: set.healthStatus,
            isPaused: existing.isPaused,
          }),
        }
      : set;
    await db.update(clients).set(perClientSet).where(eq(clients.id, id));
    if (set.healthStatus && existing.healthStatus !== set.healthStatus) {
      await db.insert(clientHealthLogs).values({
        clientId: id,
        previousStatus: existing.healthStatus as HealthStatus,
        newStatus: set.healthStatus as HealthStatus,
        reason: "Alteração em massa",
        changedById: auth.session.userId,
      });
    }
    ok++;
  }
  await logActivity({ userId: auth.session.userId, action: "client.bulkEdited", entityType: "client", metadata: { count: ok, fields: Object.keys(set) } });
  revalidatePath("/operacao");
  revalidatePath("/clientes");
  return { ok, fail: ids.length - ok, success: `${ok} cliente(s) atualizado(s).` };
}

export async function bulkAssignClients(ids: string[], userId: string): Promise<BulkResult> {
  return bulkEditClients(ids, { trafficManager1Id: userId || null });
}
export async function bulkSetClientsHealth(ids: string[], health: string): Promise<BulkResult> {
  return bulkEditClients(ids, { healthStatus: health });
}
