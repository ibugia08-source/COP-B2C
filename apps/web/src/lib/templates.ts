import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  clients,
  roles,
  taskChecklistItems,
  taskChecklists,
  tasks,
  taskTemplates,
  userRoles,
  type TemplateRole,
} from "@/db/schema";
import { logActivity } from "@/lib/activity";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Resolve o responsável padrão de um item de template para um cliente. */
async function resolveRole(
  role: TemplateRole | undefined,
  client: { trafficManager1Id: string | null; strategistId: string | null } | null,
): Promise<string | null> {
  if (!role) return null;
  if (client) {
    if (role === "GESTOR" && client.trafficManager1Id) return client.trafficManager1Id;
    if (role === "ESTRATEGISTA" && client.strategistId) return client.strategistId;
  }
  // fallback: primeiro usuário com o papel equivalente
  const roleName = (
    { GESTOR: "GESTOR_TRAFEGO", ESTRATEGISTA: "GESTOR_OPERACIONAL", SOCIAL_MEDIA: "SOCIAL_MEDIA", DESIGNER: "DESIGNER" } as const
  )[role];
  const [row] = await db
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(roles.name, roleName))
    .limit(1);
  return row?.userId ?? null;
}

export type ApplyTemplateResult = { createdTasks: number; checklistItems: number };

/**
 * Aplica um template a um cliente:
 * - asChecklist=true → cria UMA tarefa com checklist (itens do template)
 * - asChecklist=false → cria uma tarefa por item, com prazo D+N e responsável por função
 */
export async function applyTemplateToClient(
  templateSlug: string,
  clientId: string,
  opts: { actorId?: string | null; asChecklist?: boolean } = {},
): Promise<ApplyTemplateResult> {
  const template = await db.query.taskTemplates.findFirst({
    where: eq(taskTemplates.slug, templateSlug),
  });
  if (!template || !template.isActive) {
    throw new Error(`Template "${templateSlug}" não encontrado ou inativo`);
  }
  const client = await db.query.clients.findFirst({ where: eq(clients.id, clientId) });
  if (!client) throw new Error("Cliente não encontrado");

  const now = Date.now();
  let createdTasks = 0;
  let checklistItems = 0;

  if (opts.asChecklist) {
    const [task] = await db
      .insert(tasks)
      .values({
        title: `${template.name} — ${client.name}`,
        type: template.taskType,
        status: "A_FAZER",
        priority: "MEDIA",
        clientId,
        assignedToId: client.mainResponsibleId ?? client.trafficManager1Id,
        createdById: opts.actorId ?? null,
      })
      .returning();
    createdTasks = 1;
    const [checklist] = await db
      .insert(taskChecklists)
      .values({ taskId: task.id, title: template.name })
      .returning();
    await db.insert(taskChecklistItems).values(
      template.items.map((item, i) => ({
        checklistId: checklist.id,
        content: item.title,
        order: i,
      })),
    );
    checklistItems = template.items.length;
  } else if (template.items.length) {
    // resolve cada função UMA vez (≤4 queries) e insere as tarefas em lote
    const distinctRoles = [...new Set(template.items.map((i) => i.role).filter(Boolean))] as TemplateRole[];
    const assigneeByRole = new Map<TemplateRole, string | null>();
    for (const role of distinctRoles) {
      assigneeByRole.set(role, await resolveRole(role, client));
    }
    await db.insert(tasks).values(
      template.items.map((item) => ({
        title: `${item.title} — ${client.name}`,
        type: template.taskType,
        status: "A_FAZER" as const,
        priority: "MEDIA" as const,
        clientId,
        assignedToId: item.role ? (assigneeByRole.get(item.role) ?? null) : null,
        createdById: opts.actorId ?? null,
        dueDate: item.dueOffsetDays != null ? new Date(now + item.dueOffsetDays * DAY_MS) : null,
      })),
    );
    createdTasks = template.items.length;
  }

  await logActivity({
    userId: opts.actorId,
    action: "template.applied",
    entityType: "client",
    entityId: clientId,
    metadata: { templateSlug, createdTasks, checklistItems },
  });

  return { createdTasks, checklistItems };
}

/** Aplica os itens de um template como checklist dentro de uma tarefa existente. */
export async function applyTemplateToTask(
  templateSlug: string,
  taskId: string,
  opts: { actorId?: string | null } = {},
): Promise<ApplyTemplateResult> {
  const template = await db.query.taskTemplates.findFirst({
    where: eq(taskTemplates.slug, templateSlug),
  });
  if (!template || !template.isActive) {
    throw new Error(`Template "${templateSlug}" não encontrado ou inativo`);
  }
  const [checklist] = await db
    .insert(taskChecklists)
    .values({ taskId, title: template.name })
    .returning();
  await db.insert(taskChecklistItems).values(
    template.items.map((item, i) => ({
      checklistId: checklist.id,
      content: item.title,
      order: i,
    })),
  );
  await logActivity({
    userId: opts.actorId,
    action: "template.appliedToTask",
    entityType: "task",
    entityId: taskId,
    metadata: { templateSlug, items: template.items.length },
  });
  return { createdTasks: 0, checklistItems: template.items.length };
}
