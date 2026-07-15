"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  PIPELINE_STAGES,
  TASK_TYPES,
  TEMPLATE_ROLES,
  taskTemplates,
  type TemplateItem,
  type TemplateRole,
} from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { checkPermission } from "@/lib/auth/guard";
import { applyTemplateToClient } from "@/lib/templates";

export type ActionState = { error?: string; success?: string };

/**
 * Itens em texto: uma linha por item, no formato
 *   Título; D+3; GESTOR
 * (prazo e função são opcionais)
 */
function parseItems(raw: string): TemplateItem[] | string {
  const items: TemplateItem[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [title, ...rest] = trimmed.split(";").map((p) => p.trim());
    if (!title) continue;
    const item: TemplateItem = { title };
    for (const part of rest) {
      const dMatch = part.match(/^D\+(\d+)$/i);
      if (dMatch) item.dueOffsetDays = Number(dMatch[1]);
      else if (TEMPLATE_ROLES.includes(part.toUpperCase() as TemplateRole)) {
        item.role = part.toUpperCase() as TemplateRole;
      } else if (part) {
        return `Trecho não reconhecido em "${trimmed}": "${part}". Use "Título; D+3; GESTOR".`;
      }
    }
    items.push(item);
  }
  if (!items.length) return "O template precisa de pelo menos um item.";
  return items;
}

const templateSchema = z.object({
  name: z.string().trim().min(3, "Nome muito curto"),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/, "Slug deve conter apenas letras minúsculas, números e hífens"),
  description: z.string().trim().optional(),
  taskType: z.enum(TASK_TYPES),
  pipelineStage: z
    .string()
    .optional()
    .transform((v) => (v && PIPELINE_STAGES.includes(v as never) ? v : undefined)),
  itemsRaw: z.string().min(1, "Informe os itens do template"),
});

export async function saveTemplate(
  templateId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await checkPermission("tasks.manage_templates");
  if (!auth.ok) return { error: auth.error };

  const parsed = templateSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    description: formData.get("description") || undefined,
    taskType: formData.get("taskType"),
    pipelineStage: formData.get("pipelineStage") || undefined,
    itemsRaw: formData.get("itemsRaw"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  const items = parseItems(parsed.data.itemsRaw);
  if (typeof items === "string") return { error: items };

  const values = {
    name: parsed.data.name,
    slug: parsed.data.slug,
    description: parsed.data.description ?? null,
    taskType: parsed.data.taskType,
    pipelineStage: (parsed.data.pipelineStage as (typeof PIPELINE_STAGES)[number]) ?? null,
    items,
  };

  if (templateId) {
    await db.update(taskTemplates).set(values).where(eq(taskTemplates.id, templateId));
  } else {
    const existing = await db.query.taskTemplates.findFirst({
      where: eq(taskTemplates.slug, parsed.data.slug),
    });
    if (existing) return { error: "Já existe um template com este slug." };
    await db.insert(taskTemplates).values({ ...values, createdById: auth.session.userId });
  }

  await logActivity({
    userId: auth.session.userId,
    action: templateId ? "template.updated" : "template.created",
    entityType: "taskTemplate",
    entityId: templateId,
    metadata: { slug: parsed.data.slug },
  });
  revalidatePath("/tarefas/templates");
  return { success: templateId ? "Template atualizado." : "Template criado." };
}

export async function toggleTemplate(templateId: string): Promise<ActionState> {
  const auth = await checkPermission("tasks.manage_templates");
  if (!auth.ok) return { error: auth.error };
  const t = await db.query.taskTemplates.findFirst({ where: eq(taskTemplates.id, templateId) });
  if (!t) return { error: "Template não encontrado." };
  await db.update(taskTemplates).set({ isActive: !t.isActive }).where(eq(taskTemplates.id, templateId));
  revalidatePath("/tarefas/templates");
  return { success: t.isActive ? "Template desativado." : "Template ativado." };
}

export async function applyTemplateToClientAction(
  templateSlug: string,
  clientId: string,
  asChecklist: boolean,
): Promise<ActionState> {
  const auth = await checkPermission("tasks.create");
  if (!auth.ok) return { error: auth.error };
  if (!clientId) return { error: "Selecione um cliente." };
  try {
    const result = await applyTemplateToClient(templateSlug, clientId, {
      actorId: auth.session.userId,
      asChecklist,
    });
    revalidatePath("/tarefas");
    revalidatePath(`/clientes/${clientId}`);
    return {
      success: asChecklist
        ? `Tarefa com checklist de ${result.checklistItems} itens criada.`
        : `${result.createdTasks} tarefas criadas para o cliente.`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao aplicar template." };
  }
}
