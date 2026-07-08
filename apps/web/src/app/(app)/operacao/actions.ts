"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  clientHealthLogs,
  clients,
  PIPELINE_STAGES,
  tasks,
  type ClientStatus,
  type HealthStatus,
  type PipelineStage,
} from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { checkPermission } from "@/lib/auth/guard";
import { emitEvent } from "@/lib/automations/engine";
import { isValidOptionValue } from "@/lib/config-options";

export type MoveResult = { error?: string; success?: string; requires?: "PERDIDO" | "CRITICO" };

// Sincronização etapa do pipeline → status macro / saúde do cliente
const STAGE_TO_STATUS: Partial<Record<PipelineStage, ClientStatus>> = {
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
  CLIENTE_CRITICO: "EM_RISCO",
  PAUSADO: "PAUSADO",
  CLIENTE_PERDIDO: "PERDIDO",
};

export async function moveClientStage(
  clientId: string,
  toStageInput: string,
  extras?: {
    churnReason?: string;
    churnDate?: string;
    criticalReason?: string;
    actionPlan?: string;
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

  const client = await db.query.clients.findFirst({
    where: eq(clients.id, clientId),
    with: { operationalProfile: true },
  });
  if (!client) return { error: "Cliente não encontrado." };
  if (client.pipelineStage === toStage) return { success: "Cliente já está nesta etapa." };

  // Regras obrigatórias por etapa
  if (toStage === "CLIENTE_PERDIDO") {
    if (!extras?.churnReason || extras.churnReason.trim().length < 5 || !extras?.churnDate) {
      return { requires: "PERDIDO", error: "Mover para CLIENTE PERDIDO exige motivo de churn e data da perda." };
    }
  }
  if (toStage === "CLIENTE_CRITICO") {
    if (!extras?.criticalReason || extras.criticalReason.trim().length < 5 || !extras?.actionPlan || extras.actionPlan.trim().length < 5) {
      return { requires: "CRITICO", error: "Mover para CLIENTE CRÍTICO exige motivo e plano de ação." };
    }
  }
  if (toStage === "BASE_DE_CLIENTES" && !client.operationalProfile?.briefingText) {
    return {
      error: "Este cliente ainda não tem briefing operacional. Preencha a aba Operação na ficha do cliente antes de movê-lo para a Base de Clientes.",
    };
  }

  const fromStage = client.pipelineStage;
  const updates: Partial<typeof clients.$inferInsert> = { pipelineStage: toStage };
  const mappedStatus = STAGE_TO_STATUS[toStage];
  if (mappedStatus) updates.status = mappedStatus;

  if (toStage === "CLIENTE_PERDIDO") {
    updates.churnReason = extras!.churnReason!.trim();
    updates.churnDate = new Date(extras!.churnDate!);
  }
  if (toStage === "CLIENTE_CRITICO") updates.healthStatus = "CRITICO";
  if (toStage === "EM_OBSERVACAO" && client.healthStatus === "ESTAVEL") {
    updates.healthStatus = "OBSERVACAO";
  }

  await db.update(clients).set(updates).where(eq(clients.id, clientId));

  await logActivity({
    userId: auth.session.userId,
    action: "client.stageChanged",
    entityType: "client",
    entityId: clientId,
    metadata: { from: fromStage, to: toStage },
  });
  if (mappedStatus && mappedStatus !== client.status) {
    await logActivity({
      userId: auth.session.userId,
      action: "client.statusChanged",
      entityType: "client",
      entityId: clientId,
      metadata: { from: client.status, to: mappedStatus },
    });
  }

  // Saúde crítica: log próprio + tarefa de plano de ação com o conteúdo informado
  if (toStage === "CLIENTE_CRITICO") {
    if (client.healthStatus !== "CRITICO") {
      await db.insert(clientHealthLogs).values({
        clientId,
        previousStatus: client.healthStatus as HealthStatus,
        newStatus: "CRITICO",
        reason: extras!.criticalReason!.trim(),
        changedById: auth.session.userId,
      });
    }
    await db.insert(tasks).values({
      title: `Plano de ação — ${client.name} (conta crítica)`,
      description: `Motivo: ${extras!.criticalReason!.trim()}\n\nPlano de ação: ${extras!.actionPlan!.trim()}`,
      type: "OPERACIONAL",
      status: "A_FAZER",
      priority: "URGENTE",
      clientId,
      assignedToId: client.mainResponsibleId ?? client.trafficManager1Id,
      createdById: auth.session.userId,
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
  if (toStage === "CLIENTE_CRITICO" && client.healthStatus !== "CRITICO") {
    await emitEvent("CLIENT_HEALTH_CHANGED", {
      clientId,
      fromHealth: client.healthStatus,
      toHealth: "CRITICO",
      actorId: auth.session.userId,
    });
  }

  revalidatePath("/operacao");
  revalidatePath("/clientes");
  revalidatePath(`/clientes/${clientId}`);
  return { success: "Cliente movido de etapa." };
}
