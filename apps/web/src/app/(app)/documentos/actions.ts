"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { DOCUMENT_TYPES, documents } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { checkPermission } from "@/lib/auth/guard";

export type ActionState = { error?: string; success?: string; documentId?: string };

const docSchema = z.object({
  title: z.string().trim().min(3, "Título muito curto"),
  content: z.string().trim().optional(),
  type: z.enum(DOCUMENT_TYPES),
  clientId: z.string().optional(),
  taskId: z.string().optional(),
});

// Heurística anti-credencial: senhas pertencem ao Cofre, nunca a documentos.
const CREDENTIAL_PATTERNS = [
  /senha\s*[:=]/i,
  /password\s*[:=]/i,
  /login\s+e\s+senha/i,
  /usu[aá]rio\s*[:=][\s\S]*senha/i,
  /token\s*[:=]\s*\S{12,}/i,
  /api[_\s-]?key\s*[:=]/i,
];

function looksLikeCredentials(text: string): boolean {
  return CREDENTIAL_PATTERNS.some((p) => p.test(text));
}

export async function saveDocument(
  documentId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await checkPermission("tasks.view"); // qualquer membro interno da equipe
  if (!auth.ok) return { error: auth.error };

  const parsed = docSchema.safeParse({
    title: formData.get("title"),
    content: formData.get("content") || undefined,
    type: formData.get("type"),
    clientId: formData.get("clientId") || undefined,
    taskId: formData.get("taskId") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const d = parsed.data;

  if (looksLikeCredentials(`${d.title}\n${d.content ?? ""}`)) {
    return {
      error: "Este documento parece conter credenciais (senha/token). Credenciais devem ser salvas no Cofre de Acessos, nunca em documentos comuns.",
    };
  }

  if (documentId) {
    await db
      .update(documents)
      .set({
        title: d.title,
        content: d.content ?? null,
        type: d.type,
        clientId: d.clientId || null,
        taskId: d.taskId || null,
        updatedById: auth.session.userId,
      })
      .where(eq(documents.id, documentId));
    await logActivity({
      userId: auth.session.userId,
      action: "document.updated",
      entityType: d.clientId ? "client" : "document",
      entityId: d.clientId || documentId,
      metadata: { title: d.title },
    });
    revalidatePath(`/documentos/${documentId}`);
    revalidatePath("/documentos");
    return { success: "Documento atualizado.", documentId };
  }

  const [doc] = await db
    .insert(documents)
    .values({
      title: d.title,
      content: d.content ?? null,
      type: d.type,
      clientId: d.clientId || null,
      taskId: d.taskId || null,
      createdById: auth.session.userId,
      updatedById: auth.session.userId,
    })
    .returning();
  await logActivity({
    userId: auth.session.userId,
    action: "document.created",
    entityType: d.clientId ? "client" : "document",
    entityId: d.clientId || doc.id,
    metadata: { title: d.title, documentId: doc.id },
  });
  revalidatePath("/documentos");
  if (d.clientId) revalidatePath(`/clientes/${d.clientId}`);
  return { success: "Documento criado.", documentId: doc.id };
}

export async function toggleArchiveDocument(documentId: string): Promise<ActionState> {
  const auth = await checkPermission("tasks.view");
  if (!auth.ok) return { error: auth.error };
  const doc = await db.query.documents.findFirst({ where: eq(documents.id, documentId) });
  if (!doc) return { error: "Documento não encontrado." };
  await db.update(documents).set({ isArchived: !doc.isArchived, updatedById: auth.session.userId }).where(eq(documents.id, documentId));
  await logActivity({
    userId: auth.session.userId,
    action: doc.isArchived ? "document.unarchived" : "document.archived",
    entityType: "document",
    entityId: documentId,
    metadata: { title: doc.title },
  });
  revalidatePath("/documentos");
  revalidatePath(`/documentos/${documentId}`);
  return { success: doc.isArchived ? "Documento restaurado." : "Documento arquivado." };
}
