"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { formSubmissions, formTemplates } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { emitEvent } from "@/lib/automations/engine";
import type { FieldDef } from "@/app/(app)/formularios/field-types";

export type PublicFormState = { error?: string; success?: string };

// Submissão PÚBLICA (sem sessão). Guardas: só templates ativos, honeypot
// anti-bot, limites de tamanho, e NUNCA expõe/aceita vínculo de cliente.
export async function submitPublicForm(
  slug: string,
  _prev: PublicFormState,
  formData: FormData,
): Promise<PublicFormState> {
  // honeypot: bots preenchem o campo escondido "website" — respondemos ok sem gravar
  if (String(formData.get("website") ?? "").trim()) {
    return { success: "Resposta enviada. Obrigado!" };
  }

  const template = await db.query.formTemplates.findFirst({ where: eq(formTemplates.slug, slug) });
  if (!template || !template.isActive) return { error: "Formulário indisponível." };

  const respName = String(formData.get("__respName") ?? "").trim().slice(0, 200);
  const respEmail = String(formData.get("__respEmail") ?? "").trim().slice(0, 200);

  const data: Record<string, unknown> = {};
  for (const field of template.fields as unknown as FieldDef[]) {
    const value = formData.get(`f_${field.name}`);
    const s = value == null ? "" : String(value).trim().slice(0, 5000);
    if (field.required && !s) return { error: `O campo "${field.label}" é obrigatório.` };
    data[field.name] = s;
  }
  // identidade do respondente externo mora no próprio JSONB (sem migração)
  data.__respondent = { name: respName || null, email: respEmail || null };

  await db.insert(formSubmissions).values({
    templateId: template.id,
    clientId: null,
    submittedById: null, // resposta anônima/externa
    data,
  });

  await logActivity({
    userId: null,
    action: "form.publicSubmitted",
    entityType: "form",
    entityId: template.id,
    metadata: { formSlug: template.slug, formName: template.name, respondent: respEmail || respName || null },
  });
  await emitEvent("FORM_SUBMITTED", {
    formSlug: template.slug,
    comment: `Formulário público "${template.name}" respondido`,
  });

  return { success: "Resposta enviada com sucesso. Obrigado!" };
}
