"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { formSubmissions, formTemplates } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { checkPermission } from "@/lib/auth/guard";
import { emitEvent } from "@/lib/automations/engine";

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
