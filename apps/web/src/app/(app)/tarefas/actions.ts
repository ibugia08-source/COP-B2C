"use server";

import { and, asc, eq, isNull, max, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  CREATIVE_APPROVALS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_TYPES,
  taskAssignees,
  taskChecklistItems,
  taskChecklists,
  taskComments,
  tasks,
  type CreativeBrief,
  type TaskPriority,
  type TaskStatus,
} from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { isPlausibleDateOnly } from "@/lib/date";
import { checkPermission } from "@/lib/auth/guard";
import { canAccessTask } from "@/lib/auth/ownership";
import type { PermissionKey } from "@/lib/auth/permissions";
import type { SessionPayload } from "@/lib/auth/session";
import { emitEvent } from "@/lib/automations/engine";
import { isValidOptionValue, resolveDefaultValue } from "@/lib/config-options";
import { notifyUser } from "@/lib/notify";
import { applyTemplateToTask } from "@/lib/templates";

/** Status válido = enum do sistema OU coluna criada pelo admin no Kanban. */
async function isValidTaskStatus(status: string): Promise<boolean> {
  if ((TASK_STATUSES as readonly string[]).includes(status)) return true;
  return isValidOptionValue("tasks", "status", status);
}

export type ActionState = { error?: string; success?: string; taskId?: string };

/**
 * Gate de ownership: escrever numa tarefa exige ser responsável (ou adicional),
 * criador, ou responsável pelo cliente da tarefa — OWNER/ADMIN operam tudo.
 * Negações são registradas em activityLogs.
 */
async function denyTaskOutOfScope(
  session: SessionPayload,
  taskId: string,
  action: string,
  allKey: PermissionKey = "tasks.update",
): Promise<ActionState | null> {
  if (await canAccessTask(session, taskId, allKey)) return null;
  await logActivity({
    userId: session.userId,
    action: "task.ownershipDenied",
    entityType: "task",
    entityId: taskId,
    metadata: { action, reason: "ownership_scope" },
  });
  return { error: "Você não é responsável por esta tarefa." };
}

/**
 * Vincular uma tarefa a um cliente. Todos os colaboradores podem criar tarefas
 * para qualquer cliente/setor (requisito), então este gate não bloqueia mais —
 * a permissão `tasks.create` já é verificada na action. Mantido como ponto único
 * caso volte a existir restrição no futuro.
 */
async function denyClientScopeForTask(
  _session: SessionPayload,
  _clientId: string,
  _action: string,
): Promise<ActionState | null> {
  return null;
}

const taskSchema = z.object({
  title: z.string().trim().min(3, "Título muito curto"),
  description: z.string().trim().optional(),
  type: z.enum(TASK_TYPES),
  priority: z.enum(TASK_PRIORITIES),
  status: z.string().optional(), // enum do sistema ou coluna custom — validado à parte
  clientId: z.string().optional(),
  assignedToId: z.string().optional(),
  extraAssigneeIds: z.array(z.string()).default([]),
  parentTaskId: z.string().optional(),
  digitalAssetId: z.string().optional(),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
  estimatedMinutes: z.coerce.number().int().positive().optional(),
  tags: z.string().optional(), // separadas por vírgula
  // briefing de criativo (apenas quando type = CRIATIVO)
  creativeObjective: z.string().trim().optional(),
  creativePlatform: z.string().trim().optional(),
  creativeFormat: z.string().trim().optional(),
  creativeOffer: z.string().trim().optional(),
  creativeCta: z.string().trim().optional(),
  creativeReference: z.string().trim().optional(),
});

function buildCreativeBrief(d: z.infer<typeof taskSchema>, base?: CreativeBrief | null): CreativeBrief | null {
  if (d.type !== "CRIATIVO") return null;
  return {
    approvalStatus: base?.approvalStatus ?? "PENDENTE",
    objective: d.creativeObjective || undefined,
    platform: d.creativePlatform || undefined,
    format: d.creativeFormat || undefined,
    offer: d.creativeOffer || undefined,
    cta: d.creativeCta || undefined,
    referenceLink: d.creativeReference || undefined,
  };
}

function parseTaskForm(formData: FormData) {
  return taskSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    type: formData.get("type"),
    priority: formData.get("priority"),
    status: formData.get("status") || undefined,
    clientId: formData.get("clientId") || undefined,
    assignedToId: formData.get("assignedToId") || undefined,
    extraAssigneeIds: formData.getAll("extraAssigneeIds").map(String).filter(Boolean),
    parentTaskId: formData.get("parentTaskId") || undefined,
    digitalAssetId: formData.get("digitalAssetId") || undefined,
    startDate: formData.get("startDate") || undefined,
    dueDate: formData.get("dueDate") || undefined,
    estimatedMinutes: formData.get("estimatedMinutes") || undefined,
    tags: formData.get("tags") || undefined,
    creativeObjective: formData.get("creativeObjective") || undefined,
    creativePlatform: formData.get("creativePlatform") || undefined,
    creativeFormat: formData.get("creativeFormat") || undefined,
    creativeOffer: formData.get("creativeOffer") || undefined,
    creativeCta: formData.get("creativeCta") || undefined,
    creativeReference: formData.get("creativeReference") || undefined,
  });
}

function revalidateTaskPaths(taskId?: string, clientId?: string | null) {
  revalidatePath("/tarefas");
  if (taskId) revalidatePath(`/tarefas/${taskId}`);
  if (clientId) revalidatePath(`/clientes/${clientId}`);
}

export async function createTask(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await checkPermission("tasks.create");
  if (!auth.ok) return { error: auth.error };

  const parsed = parseTaskForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const d = parsed.data;

  const status = d.status || (await resolveDefaultValue("tasks", "status", "A_FAZER"));
  if (!(await isValidTaskStatus(status))) return { error: "Status inválido." };
  if (d.dueDate && !isPlausibleDateOnly(d.dueDate)) return { error: "Prazo inválido. Use uma data entre 2000 e 2100." };

  if (d.clientId) {
    const denied = await denyClientScopeForTask(auth.session, d.clientId, "createTask");
    if (denied) return denied;
  }

  // tarefa nova entra no fim da fila do Kanban (maior boardOrder)
  const [aggOrder] = await db.select({ m: max(tasks.boardOrder) }).from(tasks);
  const [task] = await db
    .insert(tasks)
    .values({
      boardOrder: (aggOrder?.m ?? 0) + 10,
      title: d.title,
      description: d.description ?? null,
      type: d.type,
      priority: d.priority,
      status: status as TaskStatus,
      creative: buildCreativeBrief(d),
      clientId: d.clientId || null,
      parentTaskId: d.parentTaskId || null,
      digitalAssetId: d.digitalAssetId || null,
      assignedToId: d.assignedToId || null,
      createdById: auth.session.userId,
      startDate: d.startDate || null,
      dueDate: d.dueDate || null,
      estimatedMinutes: d.estimatedMinutes ?? null,
      tags: d.tags ? d.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    })
    .returning();

  if (d.extraAssigneeIds.length) {
    await db.insert(taskAssignees).values(
      d.extraAssigneeIds.filter((id) => id !== d.assignedToId).map((userId) => ({ taskId: task.id, userId })),
    );
  }

  await logActivity({
    userId: auth.session.userId,
    action: "task.created",
    entityType: "task",
    entityId: task.id,
    metadata: { title: task.title, clientId: task.clientId },
  });
  // tarefa crítica notifica o responsável
  if (task.priority === "URGENTE" && task.assignedToId) {
    await notifyUser(task.assignedToId, {
      title: "Tarefa urgente atribuída a você",
      body: task.title,
      type: "TAREFA",
      entityType: "task",
      entityId: task.id,
    });
  }
  await emitEvent("TASK_CREATED", {
    taskId: task.id,
    clientId: task.clientId ?? undefined,
    assigneeId: task.assignedToId,
    withoutAssignee: !task.assignedToId,
    actorId: auth.session.userId,
  });

  revalidateTaskPaths(task.id, task.clientId);
  return { success: "Tarefa criada.", taskId: task.id };
}

export async function updateTask(
  taskId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await checkPermission("tasks.update");
  if (!auth.ok) return { error: auth.error };

  const parsed = parseTaskForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const d = parsed.data;

  const existing = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!existing) return { error: "Tarefa não encontrada." };

  const denied = await denyTaskOutOfScope(auth.session, taskId, "updateTask");
  if (denied) return denied;

  // reatribuir a tarefa para um cliente que você não gerencia é bloqueado (como no create)
  if (d.clientId && d.clientId !== existing.clientId) {
    const clientDenied = await denyClientScopeForTask(auth.session, d.clientId, "updateTask");
    if (clientDenied) return clientDenied;
  }

  await db
    .update(tasks)
    .set({
      title: d.title,
      description: d.description ?? null,
      type: d.type,
      priority: d.priority,
      creative: buildCreativeBrief(d, existing.creative),
      clientId: d.clientId || null,
      assignedToId: d.assignedToId || null,
      startDate: d.startDate || null,
      dueDate: d.dueDate || null,
      estimatedMinutes: d.estimatedMinutes ?? null,
      tags: d.tags ? d.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    })
    .where(eq(tasks.id, taskId));

  await db.delete(taskAssignees).where(eq(taskAssignees.taskId, taskId));
  if (d.extraAssigneeIds.length) {
    await db.insert(taskAssignees).values(
      d.extraAssigneeIds.filter((id) => id !== d.assignedToId).map((userId) => ({ taskId, userId })),
    );
  }

  await logActivity({
    userId: auth.session.userId,
    action: "task.updated",
    entityType: "task",
    entityId: taskId,
  });

  revalidateTaskPaths(taskId, existing.clientId);
  return { success: "Tarefa atualizada." };
}

/**
 * Reordena um card DENTRO da mesma coluna do Kanban (não muda status).
 * `beforeTaskId` = card antes do qual inserir; null = manda para o fim.
 *
 * Não passa pelas regras de `changeTaskStatus` (cancelamento/conclusão) de
 * propósito: aqui o status não muda, só a posição visual.
 */
export async function reorderTaskOnBoard(
  taskId: string,
  beforeTaskId: string | null,
): Promise<ActionState> {
  const auth = await checkPermission("tasks.update");
  if (!auth.ok) return { error: auth.error };
  if (taskId === beforeTaskId) return { success: "Sem mudança." };

  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
    columns: { id: true, status: true },
  });
  if (!task) return { error: "Tarefa não encontrada." };

  const denied = await denyTaskOutOfScope(auth.session, taskId, "reorderTaskOnBoard");
  if (denied) return denied;

  // demais cards da mesma coluna, na ordem atual
  const col = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.status, task.status), ne(tasks.id, taskId), isNull(tasks.parentTaskId)))
    .orderBy(asc(tasks.boardOrder), asc(tasks.createdAt));

  const idx = beforeTaskId ? col.findIndex((t) => t.id === beforeTaskId) : -1;
  const insertAt = idx < 0 ? col.length : idx;
  const orderedIds = [
    ...col.slice(0, insertAt).map((t) => t.id),
    taskId,
    ...col.slice(insertAt).map((t) => t.id),
  ];

  // renumera a coluna inteira num único UPDATE (VALUES), com folga de 10
  const values = sql.join(
    orderedIds.map((id, i) => sql`(${id}::text, ${(i + 1) * 10}::int)`),
    sql`, `,
  );
  await db.execute(
    sql`UPDATE "tasks" AS t SET "board_order" = v.ord FROM (VALUES ${values}) AS v(id, ord) WHERE t.id = v.id`,
  );

  revalidatePath("/tarefas");
  return { success: "Ordem atualizada." };
}

export async function changeTaskStatus(taskId: string, status: string): Promise<ActionState> {
  const auth = await checkPermission("tasks.update");
  if (!auth.ok) return { error: auth.error };
  if (!(await isValidTaskStatus(status))) return { error: "Status inválido." };
  if (status === "CANCELADA") return { error: "Para cancelar, use a ação Cancelar (exige motivo)." };

  const existing = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!existing) return { error: "Tarefa não encontrada." };

  const denied = await denyTaskOutOfScope(auth.session, taskId, "changeTaskStatus");
  if (denied) return denied;

  if (status === "CONCLUIDA") {
    const complete = await checkPermission("tasks.complete");
    if (!complete.ok) return { error: complete.error };
  }

  await db
    .update(tasks)
    .set({ status: status as TaskStatus, completedAt: status === "CONCLUIDA" ? new Date() : null })
    .where(eq(tasks.id, taskId));

  await logActivity({
    userId: auth.session.userId,
    action: status === "CONCLUIDA" ? "task.completed" : "task.statusChanged",
    entityType: "task",
    entityId: taskId,
    metadata: { from: existing.status, to: status },
  });
  await emitEvent("TASK_STATUS_CHANGED", {
    taskId,
    clientId: existing.clientId ?? undefined,
    assigneeId: existing.assignedToId,
    from: existing.status,
    to: status,
    actorId: auth.session.userId,
  });

  revalidateTaskPaths(taskId, existing.clientId);
  return { success: "Status atualizado." };
}

export async function cancelTask(taskId: string, reason: string): Promise<ActionState> {
  const auth = await checkPermission("tasks.update");
  if (!auth.ok) return { error: auth.error };
  if (reason.trim().length < 5) return { error: "Cancelamento exige um motivo (mínimo 5 caracteres)." };

  const existing = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!existing) return { error: "Tarefa não encontrada." };

  const denied = await denyTaskOutOfScope(auth.session, taskId, "cancelTask");
  if (denied) return denied;

  await db
    .update(tasks)
    .set({ status: "CANCELADA", cancelReason: reason.trim() })
    .where(eq(tasks.id, taskId));
  await logActivity({
    userId: auth.session.userId,
    action: "task.cancelled",
    entityType: "task",
    entityId: taskId,
    metadata: { reason: reason.trim() },
  });

  revalidateTaskPaths(taskId, existing.clientId);
  return { success: "Tarefa cancelada." };
}

export async function deleteTask(taskId: string): Promise<ActionState> {
  const auth = await checkPermission("tasks.delete");
  if (!auth.ok) return { error: auth.error };
  const existing = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!existing) return { error: "Tarefa não encontrada." };

  const denied = await denyTaskOutOfScope(auth.session, taskId, "deleteTask", "tasks.delete");
  if (denied) return denied;

  await db.delete(tasks).where(eq(tasks.id, taskId));
  await db.delete(tasks).where(eq(tasks.parentTaskId, taskId));
  await logActivity({
    userId: auth.session.userId,
    action: "task.deleted",
    entityType: "task",
    entityId: taskId,
    metadata: { title: existing.title },
  });
  revalidateTaskPaths(undefined, existing.clientId);
  return { success: "Tarefa excluída." };
}

export async function addComment(taskId: string, body: string): Promise<ActionState> {
  const auth = await checkPermission("tasks.view");
  if (!auth.ok) return { error: auth.error };
  if (!body.trim()) return { error: "Comentário vazio." };

  const denied = await denyTaskOutOfScope(auth.session, taskId, "addComment");
  if (denied) return denied;

  await db.insert(taskComments).values({ taskId, authorId: auth.session.userId, body: body.trim() });
  revalidatePath(`/tarefas/${taskId}`);
  return { success: "Comentário adicionado." };
}

export async function addChecklist(taskId: string, title: string): Promise<ActionState> {
  const auth = await checkPermission("tasks.update");
  if (!auth.ok) return { error: auth.error };
  if (!title.trim()) return { error: "Informe o título do checklist." };
  const denied = await denyTaskOutOfScope(auth.session, taskId, "addChecklist");
  if (denied) return denied;
  await db.insert(taskChecklists).values({ taskId, title: title.trim() });
  revalidatePath(`/tarefas/${taskId}`);
  return { success: "Checklist criado." };
}

export async function addChecklistItem(checklistId: string, taskId: string, content: string): Promise<ActionState> {
  const auth = await checkPermission("tasks.update");
  if (!auth.ok) return { error: auth.error };
  if (!content.trim()) return { error: "Item vazio." };
  const denied = await denyTaskOutOfScope(auth.session, taskId, "addChecklistItem");
  if (denied) return denied;
  const siblings = await db
    .select({ order: taskChecklistItems.order })
    .from(taskChecklistItems)
    .where(eq(taskChecklistItems.checklistId, checklistId));
  await db.insert(taskChecklistItems).values({
    checklistId,
    content: content.trim(),
    order: siblings.length,
  });
  revalidatePath(`/tarefas/${taskId}`);
  return { success: "Item adicionado." };
}

export async function toggleChecklistItem(itemId: string, taskId: string): Promise<ActionState> {
  const auth = await checkPermission("tasks.update");
  if (!auth.ok) return { error: auth.error };
  const item = await db.query.taskChecklistItems.findFirst({
    where: eq(taskChecklistItems.id, itemId),
  });
  if (!item) return { error: "Item não encontrado." };
  const denied = await denyTaskOutOfScope(auth.session, taskId, "toggleChecklistItem");
  if (denied) return denied;
  await db
    .update(taskChecklistItems)
    .set({
      isDone: !item.isDone,
      completedById: !item.isDone ? auth.session.userId : null,
      completedAt: !item.isDone ? new Date() : null,
    })
    .where(eq(taskChecklistItems.id, itemId));
  revalidatePath(`/tarefas/${taskId}`);
  return { success: "Item atualizado." };
}

export async function applyTemplateAction(taskId: string, templateSlug: string): Promise<ActionState> {
  const auth = await checkPermission("tasks.update");
  if (!auth.ok) return { error: auth.error };
  const denied = await denyTaskOutOfScope(auth.session, taskId, "applyTemplateAction");
  if (denied) return denied;
  try {
    const result = await applyTemplateToTask(templateSlug, taskId, { actorId: auth.session.userId });
    revalidatePath(`/tarefas/${taskId}`);
    return { success: `Checklist criado com ${result.checklistItems} itens.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao aplicar template." };
  }
}

export async function addAttachment(taskId: string, fileName: string, fileUrl: string): Promise<ActionState> {
  const auth = await checkPermission("tasks.update");
  if (!auth.ok) return { error: auth.error };
  if (!fileName.trim() || !fileUrl.trim()) return { error: "Informe nome e link do arquivo." };
  try {
    new URL(fileUrl);
  } catch {
    return { error: "Link do arquivo inválido." };
  }
  const denied = await denyTaskOutOfScope(auth.session, taskId, "addAttachment");
  if (denied) return denied;
  const { taskAttachments } = await import("@/db/schema");
  await db.insert(taskAttachments).values({
    taskId,
    fileName: fileName.trim(),
    fileUrl: fileUrl.trim(),
    uploadedById: auth.session.userId,
  });
  revalidatePath(`/tarefas/${taskId}`);
  return { success: "Anexo adicionado." };
}

export async function addTimeEntry(taskId: string, minutes: number, description: string): Promise<ActionState> {
  const auth = await checkPermission("tasks.update");
  if (!auth.ok) return { error: auth.error };
  if (!Number.isFinite(minutes) || minutes <= 0) return { error: "Informe minutos válidos." };
  const { taskTimeEntries } = await import("@/db/schema");
  const existing = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!existing) return { error: "Tarefa não encontrada." };
  const denied = await denyTaskOutOfScope(auth.session, taskId, "addTimeEntry");
  if (denied) return denied;
  await db.insert(taskTimeEntries).values({
    taskId,
    userId: auth.session.userId,
    minutes: Math.round(minutes),
    description: description.trim() || null,
    date: new Date(),
  });
  await db
    .update(tasks)
    .set({ trackedMinutes: existing.trackedMinutes + Math.round(minutes) })
    .where(eq(tasks.id, taskId));
  revalidatePath(`/tarefas/${taskId}`);
  return { success: "Tempo registrado." };
}

/** Criação rápida direto de uma coluna do Kanban ou do fim da Lista. */
/** Campos opcionais do card de criação rápida (todos já existem em `tasks`). */
export type QuickTaskFields = {
  assignedToId?: string | null;
  priority?: string | null;
  tags?: string[] | null;
  dueDate?: string | null; // data-only 'YYYY-MM-DD'
};

export async function quickCreateTask(
  title: string,
  status: string,
  clientId?: string | null,
  extra?: QuickTaskFields,
): Promise<ActionState> {
  const auth = await checkPermission("tasks.create");
  if (!auth.ok) return { error: auth.error };
  const clean = title.trim();
  if (clean.length < 3) return { error: "Título muito curto." };
  if (!(await isValidTaskStatus(status)) || status === "CANCELADA") return { error: "Coluna inválida." };

  if (clientId) {
    const denied = await denyClientScopeForTask(auth.session, clientId, "quickCreateTask");
    if (denied) return denied;
  }

  // prioridade fora do enum cai no padrão, em vez de gravar lixo
  const priority = (TASK_PRIORITIES as readonly string[]).includes(extra?.priority ?? "")
    ? (extra!.priority as TaskPriority)
    : "MEDIA";

  // o <input type="date"> aceita ano digitado errado (ex.: 0900) — barra aqui
  if (extra?.dueDate && !isPlausibleDateOnly(extra.dueDate)) {
    return { error: "Prazo inválido. Use uma data entre 2000 e 2100." };
  }

  // tarefa nova entra no fim da fila do Kanban (maior boardOrder)
  const [aggQuickOrder] = await db.select({ m: max(tasks.boardOrder) }).from(tasks);
  const [task] = await db
    .insert(tasks)
    .values({
      boardOrder: (aggQuickOrder?.m ?? 0) + 10,
      title: clean,
      type: "OPERACIONAL",
      priority,
      status: status as TaskStatus,
      clientId: clientId || null,
      assignedToId: extra?.assignedToId || null,
      dueDate: extra?.dueDate || null,
      tags: extra?.tags?.length ? extra.tags : [],
      createdById: auth.session.userId,
      completedAt: status === "CONCLUIDA" ? new Date() : null,
    })
    .returning();

  await logActivity({
    userId: auth.session.userId,
    action: "task.created",
    entityType: "task",
    entityId: task.id,
    metadata: { title: task.title, clientId: task.clientId, quick: true },
  });
  await emitEvent("TASK_CREATED", {
    taskId: task.id,
    clientId: task.clientId ?? undefined,
    assigneeId: task.assignedToId,
    withoutAssignee: !task.assignedToId,
    actorId: auth.session.userId,
  });

  revalidateTaskPaths(task.id, task.clientId);
  return { success: "Tarefa criada.", taskId: task.id };
}

/** Atualiza o briefing/aprovação de uma tarefa do tipo CRIATIVO. */
export async function updateCreativeBrief(taskId: string, brief: CreativeBrief): Promise<ActionState> {
  const auth = await checkPermission("tasks.update");
  if (!auth.ok) return { error: auth.error };
  const existing = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!existing) return { error: "Tarefa não encontrada." };
  if (existing.type !== "CRIATIVO") return { error: "Briefing só existe em tarefas do tipo Criativo." };
  const denied = await denyTaskOutOfScope(auth.session, taskId, "updateCreativeBrief");
  if (denied) return denied;
  if (brief.approvalStatus && !CREATIVE_APPROVALS.includes(brief.approvalStatus)) {
    return { error: "Status de aprovação inválido." };
  }
  if (brief.referenceLink && !/^https?:\/\//.test(brief.referenceLink)) {
    return { error: "Link de referência deve começar com http(s)://" };
  }

  const clean: CreativeBrief = {
    approvalStatus: brief.approvalStatus ?? existing.creative?.approvalStatus ?? "PENDENTE",
    objective: brief.objective?.trim() || undefined,
    platform: brief.platform?.trim() || undefined,
    format: brief.format?.trim() || undefined,
    offer: brief.offer?.trim() || undefined,
    cta: brief.cta?.trim() || undefined,
    referenceLink: brief.referenceLink?.trim() || undefined,
  };
  await db.update(tasks).set({ creative: clean }).where(eq(tasks.id, taskId));
  await logActivity({
    userId: auth.session.userId,
    action: "task.creativeUpdated",
    entityType: "task",
    entityId: taskId,
    metadata: { approvalStatus: clean.approvalStatus },
  });
  revalidateTaskPaths(taskId, existing.clientId);
  return { success: "Briefing atualizado." };
}

// ---------------------------------------------------------------------------
// Ações em massa (seleção múltipla no Kanban/Lista)
// ---------------------------------------------------------------------------

export type BulkResult = { ok: number; fail: number; error?: string; success?: string };

export async function bulkDeleteTasks(ids: string[]): Promise<BulkResult> {
  const auth = await checkPermission("tasks.delete");
  if (!auth.ok) return { ok: 0, fail: 0, error: auth.error };
  let ok = 0;
  const clientIds = new Set<string>();
  for (const id of ids) {
    const existing = await db.query.tasks.findFirst({ where: eq(tasks.id, id) });
    if (!existing) continue;
    if (await denyTaskOutOfScope(auth.session, id, "bulkDeleteTasks", "tasks.delete")) continue;
    await db.delete(tasks).where(eq(tasks.parentTaskId, id));
    await db.delete(tasks).where(eq(tasks.id, id));
    if (existing.clientId) clientIds.add(existing.clientId);
    ok++;
  }
  await logActivity({
    userId: auth.session.userId,
    action: "task.bulkDeleted",
    entityType: "task",
    metadata: { count: ok },
  });
  revalidatePath("/tarefas");
  for (const c of clientIds) revalidatePath(`/clientes/${c}`);
  return { ok, fail: ids.length - ok, success: `${ok} tarefa(s) excluída(s).` };
}

/**
 * Arquivar/desarquivar em massa. Arquivar tira a tarefa do quadro e das listas
 * sem excluir — o histórico fica consultável na visão "Arquivadas".
 *
 * Usa `tasks.update` (não `tasks.delete`): arquivar é reversível.
 */
async function setTasksArchived(ids: string[], archived: boolean): Promise<BulkResult> {
  const auth = await checkPermission("tasks.update");
  if (!auth.ok) return { ok: 0, fail: 0, error: auth.error };
  let ok = 0;
  const clientIds = new Set<string>();
  for (const id of ids) {
    const existing = await db.query.tasks.findFirst({ where: eq(tasks.id, id) });
    if (!existing) continue;
    if (await denyTaskOutOfScope(auth.session, id, archived ? "bulkArchiveTasks" : "bulkUnarchiveTasks")) continue;
    await db
      .update(tasks)
      .set({ archivedAt: archived ? new Date() : null })
      .where(eq(tasks.id, id));
    if (existing.clientId) clientIds.add(existing.clientId);
    ok++;
  }
  await logActivity({
    userId: auth.session.userId,
    action: archived ? "task.bulkArchived" : "task.bulkUnarchived",
    entityType: "task",
    metadata: { count: ok },
  });
  revalidatePath("/tarefas");
  for (const c of clientIds) revalidatePath(`/clientes/${c}`);
  return {
    ok,
    fail: ids.length - ok,
    success: `${ok} tarefa(s) ${archived ? "arquivada(s)" : "desarquivada(s)"}.`,
  };
}

export async function bulkArchiveTasks(ids: string[]): Promise<BulkResult> {
  return setTasksArchived(ids, true);
}

export async function bulkUnarchiveTasks(ids: string[]): Promise<BulkResult> {
  return setTasksArchived(ids, false);
}

export async function bulkMoveTasks(ids: string[], status: string): Promise<BulkResult> {
  const auth = await checkPermission("tasks.update");
  if (!auth.ok) return { ok: 0, fail: 0, error: auth.error };
  if (!(await isValidTaskStatus(status)) || status === "CANCELADA") {
    return { ok: 0, fail: 0, error: "Status inválido para mover em massa." };
  }
  if (status === "CONCLUIDA") {
    const complete = await checkPermission("tasks.complete");
    if (!complete.ok) return { ok: 0, fail: 0, error: complete.error };
  }
  let ok = 0;
  for (const id of ids) {
    const existing = await db.query.tasks.findFirst({ where: eq(tasks.id, id) });
    if (!existing || existing.status === status) continue;
    if (await denyTaskOutOfScope(auth.session, id, "bulkMoveTasks")) continue;
    await db
      .update(tasks)
      .set({ status: status as TaskStatus, completedAt: status === "CONCLUIDA" ? new Date() : null })
      .where(eq(tasks.id, id));
    ok++;
  }
  await logActivity({ userId: auth.session.userId, action: "task.bulkMoved", entityType: "task", metadata: { count: ok, status } });
  revalidatePath("/tarefas");
  return { ok, fail: ids.length - ok, success: `${ok} tarefa(s) movida(s).` };
}

export async function bulkEditTasks(
  ids: string[],
  patch: { assignedToId?: string | null; priority?: string },
): Promise<BulkResult> {
  const auth = await checkPermission("tasks.update");
  if (!auth.ok) return { ok: 0, fail: 0, error: auth.error };
  const set: Partial<typeof tasks.$inferInsert> = {};
  if (patch.assignedToId !== undefined) set.assignedToId = patch.assignedToId || null;
  if (patch.priority && (TASK_PRIORITIES as readonly string[]).includes(patch.priority)) {
    set.priority = patch.priority as (typeof TASK_PRIORITIES)[number];
  }
  if (Object.keys(set).length === 0) return { ok: 0, fail: 0, error: "Nada para editar." };
  let ok = 0;
  for (const id of ids) {
    const existing = await db.query.tasks.findFirst({ where: eq(tasks.id, id) });
    if (!existing) continue;
    if (await denyTaskOutOfScope(auth.session, id, "bulkEditTasks")) continue;
    await db.update(tasks).set(set).where(eq(tasks.id, id));
    ok++;
  }
  await logActivity({ userId: auth.session.userId, action: "task.bulkEdited", entityType: "task", metadata: { count: ok, fields: Object.keys(set) } });
  revalidatePath("/tarefas");
  return { ok, fail: ids.length - ok, success: `${ok} tarefa(s) atualizada(s).` };
}

export async function assignTask(taskId: string, userId: string | null): Promise<ActionState> {
  const auth = await checkPermission("tasks.assign");
  if (!auth.ok) return { error: auth.error };
  const existing = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!existing) return { error: "Tarefa não encontrada." };
  const denied = await denyTaskOutOfScope(auth.session, taskId, "assignTask");
  if (denied) return denied;
  await db.update(tasks).set({ assignedToId: userId }).where(eq(tasks.id, taskId));
  await logActivity({
    userId: auth.session.userId,
    action: "task.assigned",
    entityType: "task",
    entityId: taskId,
    metadata: { from: existing.assignedToId, to: userId },
  });
  if (userId) {
    await notifyUser(userId, {
      title: "Tarefa atribuída a você",
      body: existing.title,
      type: "TAREFA",
      entityType: "task",
      entityId: taskId,
    });
  }
  revalidateTaskPaths(taskId, existing.clientId);
  return { success: "Responsável atualizado." };
}

export async function bulkAssignTasks(ids: string[], userId: string): Promise<BulkResult> {
  return bulkEditTasks(ids, { assignedToId: userId || null });
}
export async function bulkPrioritizeTasks(ids: string[], priority: string): Promise<BulkResult> {
  return bulkEditTasks(ids, { priority });
}
