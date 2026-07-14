"use server";

import { count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { formSubmissions, formTemplates } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { checkAdmin, checkPermission } from "@/lib/auth/guard";
import { emitEvent } from "@/lib/automations/engine";
import { isFieldType, slugify, typeHasOptions, type FieldDef } from "./field-types";

export type ActionState = { error?: string; success?: string };

export async function submitForm(
  templateId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await checkPermission("tasks.view"); // qualquer membro interno
  if (!auth.ok) return { error: auth.error };

  const template = await db.query.formTemplates.findFirst({
    where: eq(formTemplates.id, templateId),
  });
  if (!template || !template.isActive) return { error: "Formulário não encontrado ou inativo." };

  const clientId = String(formData.get("__clientId") ?? "") || null;
  const data: Record<string, unknown> = {};
  for (const field of template.fields as { name: string; label: string; required?: boolean }[]) {
    const value = formData.get(`f_${field.name}`);
    const str = value == null ? "" : String(value).trim();
    if (field.required && !str) {
      return { error: `O campo "${field.label}" é obrigatório.` };
    }
    data[field.name] = str;
  }

  await db.insert(formSubmissions).values({
    templateId,
    clientId,
    submittedById: auth.session.userId,
    data,
  });
  await logActivity({
    userId: auth.session.userId,
    action: "form.submitted",
    entityType: clientId ? "client" : "form",
    entityId: clientId ?? templateId,
    metadata: { formSlug: template.slug, formName: template.name },
  });
  await emitEvent("FORM_SUBMITTED", {
    formSlug: template.slug,
    clientId: clientId ?? undefined,
    actorId: auth.session.userId,
    comment: `Formulário "${template.name}" enviado`,
  });

  revalidatePath("/formularios");
  if (clientId) revalidatePath(`/clientes/${clientId}`);
  return { success: "Formulário enviado com sucesso." };
}

// ---------------------------------------------------------------------------
// Construtor de formulários (CRUD de templates) — restrito a OWNER/ADMIN
// ---------------------------------------------------------------------------

const builderFieldSchema = z.object({
  name: z.string().optional(),
  label: z.string().trim().min(1, "Todo campo precisa de um rótulo."),
  type: z.string(),
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
});

/** Gera um slug único para a URL pública do formulário. */
async function uniqueSlug(base: string): Promise<string> {
  const rows = await db.select({ slug: formTemplates.slug }).from(formTemplates);
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

/** Cria ou atualiza um template de formulário (definição de campos em JSONB). */
export async function saveTemplate(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await checkAdmin();
  if (!auth.ok) return { error: auth.error };

  const id = String(formData.get("id") ?? "") || null;
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Dê um nome ao formulário." };
  const description = String(formData.get("description") ?? "").trim() || null;

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("fields") ?? "[]"));
  } catch {
    return { error: "Definição de campos inválida." };
  }
  const parsed = z.array(builderFieldSchema).safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Campos inválidos." };
  if (parsed.data.length === 0) return { error: "Adicione pelo menos um campo." };

  // normaliza: valida o tipo, gera nome de máquina único e exige opções em select/radio
  const usedNames = new Set<string>();
  const fields: FieldDef[] = [];
  for (const f of parsed.data) {
    if (!isFieldType(f.type)) return { error: `Tipo de campo inválido: ${f.type}` };
    const base = (f.name && f.name.trim()) || slugify(f.label);
    let nm = base;
    let i = 2;
    while (usedNames.has(nm)) nm = `${base}_${i++}`;
    usedNames.add(nm);
    const options = (f.options ?? []).map((o) => o.trim()).filter(Boolean);
    if (typeHasOptions(f.type) && options.length === 0) {
      return { error: `O campo "${f.label}" precisa de ao menos uma opção.` };
    }
    fields.push({
      name: nm,
      label: f.label.trim(),
      type: f.type,
      required: !!f.required,
      ...(typeHasOptions(f.type) ? { options } : {}),
    });
  }

  if (id) {
    const existing = await db.query.formTemplates.findFirst({ where: eq(formTemplates.id, id) });
    if (!existing) return { error: "Formulário não encontrado." };
    await db
      .update(formTemplates)
      .set({ name, description, fields, updatedAt: new Date() })
      .where(eq(formTemplates.id, id));
    await logActivity({
      userId: auth.session.userId,
      action: "form.templateUpdated",
      entityType: "form",
      entityId: id,
      metadata: { name },
    });
    revalidatePath("/formularios");
    return { success: "Formulário atualizado." };
  }

  const slug = await uniqueSlug(slugify(name, "formulario"));
  const [created] = await db
    .insert(formTemplates)
    .values({ name, slug, description, fields, isActive: true, createdById: auth.session.userId })
    .returning();
  await logActivity({
    userId: auth.session.userId,
    action: "form.templateCreated",
    entityType: "form",
    entityId: created.id,
    metadata: { name, slug },
  });
  revalidatePath("/formularios");
  return { success: "Formulário criado." };
}

/** Exclui um template — bloqueado se já houver respostas (preserva histórico). */
export async function deleteTemplate(id: string): Promise<ActionState> {
  const auth = await checkAdmin();
  if (!auth.ok) return { error: auth.error };

  const [{ n }] = await db
    .select({ n: count() })
    .from(formSubmissions)
    .where(eq(formSubmissions.templateId, id));
  if (n > 0) {
    return { error: `Este formulário tem ${n} resposta(s). Desative-o em vez de excluir, para preservar o histórico.` };
  }
  const tpl = await db.query.formTemplates.findFirst({ where: eq(formTemplates.id, id) });
  if (!tpl) return { error: "Formulário não encontrado." };

  await db.delete(formTemplates).where(eq(formTemplates.id, id));
  await logActivity({
    userId: auth.session.userId,
    action: "form.templateDeleted",
    entityType: "form",
    entityId: id,
    metadata: { name: tpl.name },
  });
  revalidatePath("/formularios");
  return { success: "Formulário excluído." };
}

/** Ativa/desativa um formulário (some da URL pública quando inativo). */
export async function toggleTemplateActive(id: string): Promise<ActionState> {
  const auth = await checkAdmin();
  if (!auth.ok) return { error: auth.error };

  const tpl = await db.query.formTemplates.findFirst({ where: eq(formTemplates.id, id) });
  if (!tpl) return { error: "Formulário não encontrado." };

  await db
    .update(formTemplates)
    .set({ isActive: !tpl.isActive, updatedAt: new Date() })
    .where(eq(formTemplates.id, id));
  revalidatePath("/formularios");
  return { success: tpl.isActive ? "Formulário desativado." : "Formulário ativado." };
}
