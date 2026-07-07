"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_TYPES,
  taskAssignees,
  taskChecklistItems,
  taskChecklists,
  taskComments,
  tasks,
  type TaskStatus,
} from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { checkPermission } from "@/lib/auth/guard";
import { emitEvent } from "@/lib/automations/engine";
import { notifyUser } from "@/lib/notify";
import { applyTemplateToTask } from "@/lib/templates";

export type ActionState = { error?: string; success?: string; taskId?: string };

const taskSchema = z.object({
  title: z.string().trim().min(3, "Título muito curto"),
  description: z.string().trim().optional(),
  type: z.enum(TASK_TYPES),
  priority: z.enum(TASK_PRIORITIES),
  status: z.enum(TASK_STATUSES).default("A_FAZER"),
  clientId: z.string().optional(),
  assignedToId: z.string().optional(),
  extraAssigneeIds: z.array(z.string()).default([]),
  parentTaskId: z.string().optional(),
  digitalAssetId: z.string().optional(),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
  estimatedMinutes: z.coerce.number().int().positive().optional(),
  tags: z.string().optional(), // separadas por vírgula
});

function parseTaskForm(formData: FormData) {
  return taskSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    type: formData.get("type"),
    priority: formData.get("priority"),
    status: formData.get("status") || "A_FAZER",
    clientId: formData.get("clientId") || undefined,
    assignedToId: formData.get("assignedToId") || undefined,
    extraAssigneeIds: formData.getAll("extraAssigneeIds").map(String).filter(Boolean),
    parentTaskId: formData.get("parentTaskId") || undefined,
    digitalAssetId: formData.get("digitalAssetId") || undefined,
    startDate: formData.get("startDate") || undefined,
    dueDate: formData.get("dueDate") || undefined,
    estimatedMinutes: formData.get("estimatedMinutes") || undefined,
    tags: formData.get("tags") || undefined,
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

  const [task] = await db
    .insert(tasks)
    .values({
      title: d.title,
      description: d.description ?? null,
      type: d.type,
      priority: d.priority,
      status: d.status,
      clientId: d.clientId || null,
      parentTaskId: d.parentTaskId || null,
      digitalAssetId: d.digitalAssetId || null,
      assignedToId: d.assignedToId || null,
      createdById: auth.session.userId,
      startDate: d.startDate ? new Date(d.startDate) : null,
      dueDate: d.dueDate ? new Date(d.dueDate) : null,
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

  await db
    .update(tasks)
    .set({
      title: d.title,
      description: d.description ?? null,
      type: d.type,
      priority: d.priority,
      clientId: d.clientId || null,
      assignedToId: d.assignedToId || null,
      startDate: d.startDate ? new Date(d.startDate) : null,
      dueDate: d.dueDate ? new Date(d.dueDate) : null,
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

export async function changeTaskStatus(taskId: string, status: TaskStatus): Promise<ActionState> {
  const auth = await checkPermission("tasks.update");
  if (!auth.ok) return { error: auth.error };
  if (!TASK_STATUSES.includes(status)) return { error: "Status inválido." };
  if (status === "CANCELADA") return { error: "Para cancelar, use a ação Cancelar (exige motivo)." };

  const existing = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!existing) return { error: "Tarefa não encontrada." };

  if (status === "CONCLUIDA") {
    const complete = await checkPermission("tasks.complete");
    if (!complete.ok) return { error: complete.error };
  }

  await db
    .update(tasks)
    .set({ status, completedAt: status === "CONCLUIDA" ? new Date() : null })
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

  await db.insert(taskComments).values({ taskId, authorId: auth.session.userId, body: body.trim() });
  revalidatePath(`/tarefas/${taskId}`);
  return { success: "Comentário adicionado." };
}

export async function addChecklist(taskId: string, title: string): Promise<ActionState> {
  const auth = await checkPermission("tasks.update");
  if (!auth.ok) return { error: auth.error };
  if (!title.trim()) return { error: "Informe o título do checklist." };
  await db.insert(taskChecklists).values({ taskId, title: title.trim() });
  revalidatePath(`/tarefas/${taskId}`);
  return { success: "Checklist criado." };
}

export async function addChecklistItem(checklistId: string, taskId: string, content: string): Promise<ActionState> {
  const auth = await checkPermission("tasks.update");
  if (!auth.ok) return { error: auth.error };
  if (!content.trim()) return { error: "Item vazio." };
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

export async function assignTask(taskId: string, userId: string | null): Promise<ActionState> {
  const auth = await checkPermission("tasks.assign");
  if (!auth.ok) return { error: auth.error };
  const existing = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!existing) return { error: "Tarefa não encontrada." };
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
