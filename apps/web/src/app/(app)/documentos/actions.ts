"use server";

import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { DOCUMENT_SOURCES, DOCUMENT_TYPES, documents } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { checkPermission } from "@/lib/auth/guard";
import { isGoogleDriveUrl, parseDriveUrl } from "@/lib/google-drive";

export type ActionState = { error?: string; success?: string; documentId?: string };

const UPLOADS_DIR = join(process.cwd(), "uploads", "documentos");
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

const docSchema = z.object({
  title: z.string().trim().min(3, "Título muito curto"),
  description: z.string().trim().optional(),
  content: z.string().trim().optional(),
  type: z.enum(DOCUMENT_TYPES),
  sourceType: z.enum(DOCUMENT_SOURCES),
  fileUrl: z.string().trim().optional(),
  googleDriveUrl: z.string().trim().optional(),
  clientId: z.string().optional(),
  taskId: z.string().optional(),
  digitalAssetId: z.string().optional(),
});

// Heurística anti-credencial: senhas pertencem ao Banco de Ativos, nunca a documentos.
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

function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function revalidateDoc(documentId?: string, clientId?: string | null) {
  revalidatePath("/documentos");
  if (documentId) revalidatePath(`/documentos/${documentId}`);
  if (clientId) revalidatePath(`/clientes/${clientId}`);
}

/**
 * Cria/atualiza um documento. Suporta quatro origens:
 *  - INTERNAL: wiki em markdown (campo content);
 *  - EXTERNAL_LINK: link http(s) externo (fileUrl);
 *  - GOOGLE_DRIVE: link do Drive/Docs (googleDriveUrl → fileId + tipo inferidos);
 *  - UPLOAD: tratado por uploadDocument (multipart).
 */
export async function saveDocument(
  documentId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await checkPermission("tasks.view"); // qualquer membro interno da equipe
  if (!auth.ok) return { error: auth.error };

  const parsed = docSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    content: formData.get("content") || undefined,
    type: formData.get("type"),
    sourceType: formData.get("sourceType") || "INTERNAL",
    fileUrl: formData.get("fileUrl") || undefined,
    googleDriveUrl: formData.get("googleDriveUrl") || undefined,
    clientId: formData.get("clientId") || undefined,
    taskId: formData.get("taskId") || undefined,
    digitalAssetId: formData.get("digitalAssetId") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const d = parsed.data;

  if (looksLikeCredentials(`${d.title}\n${d.description ?? ""}\n${d.content ?? ""}`)) {
    return {
      error:
        "Este documento parece conter credenciais (senha/token). Credenciais devem ser salvas no Banco de Ativos Digitais, nunca em documentos.",
    };
  }

  const values: Partial<typeof documents.$inferInsert> = {
    title: d.title,
    description: d.description ?? null,
    type: d.type,
    sourceType: d.sourceType,
    clientId: d.clientId || null,
    taskId: d.taskId || null,
    digitalAssetId: d.digitalAssetId || null,
    updatedById: auth.session.userId,
  };

  // Regras por origem
  if (d.sourceType === "INTERNAL") {
    values.content = d.content ?? null;
    values.fileUrl = null;
    values.googleDriveUrl = null;
    values.googleDriveFileId = null;
  } else if (d.sourceType === "EXTERNAL_LINK") {
    if (!d.fileUrl || !isHttpUrl(d.fileUrl)) return { error: "Informe um link válido (http/https)." };
    values.fileUrl = d.fileUrl;
    values.content = null;
  } else if (d.sourceType === "GOOGLE_DRIVE") {
    if (!d.googleDriveUrl || !isHttpUrl(d.googleDriveUrl)) return { error: "Informe um link válido do Google Drive." };
    if (!isGoogleDriveUrl(d.googleDriveUrl)) {
      return { error: "O link não parece ser do Google Drive/Docs (drive.google.com ou docs.google.com)." };
    }
    const drive = parseDriveUrl(d.googleDriveUrl);
    values.googleDriveUrl = d.googleDriveUrl;
    values.googleDriveFileId = drive.fileId;
    values.fileUrl = d.googleDriveUrl;
    values.mimeType = drive.mimeType;
    values.content = null;
    // Só ajusta o tipo automaticamente quando o usuário deixou "OUTRO"/interno.
    if (drive.documentType !== "OUTRO" && (d.type === "OUTRO" || d.type === "WIKI")) {
      values.type = drive.documentType;
    }
  } else if (d.sourceType === "UPLOAD") {
    // Upload é feito por uploadDocument; aqui só permitimos editar metadados.
    if (!documentId) return { error: "Use o botão de upload para enviar o arquivo." };
  }

  if (documentId) {
    await db.update(documents).set(values).where(eq(documents.id, documentId));
    await logActivity({
      userId: auth.session.userId,
      action: "document.updated",
      entityType: d.clientId ? "client" : "document",
      entityId: d.clientId || documentId,
      metadata: { title: d.title, sourceType: d.sourceType },
    });
    revalidateDoc(documentId, d.clientId);
    return { success: "Documento atualizado.", documentId };
  }

  const [doc] = await db
    .insert(documents)
    .values({ ...values, title: d.title, createdById: auth.session.userId })
    .returning();
  await logActivity({
    userId: auth.session.userId,
    action: "document.created",
    entityType: d.clientId ? "client" : "document",
    entityId: d.clientId || doc.id,
    metadata: { title: d.title, documentId: doc.id, sourceType: d.sourceType },
  });
  revalidateDoc(doc.id, d.clientId);
  return { success: "Documento criado.", documentId: doc.id };
}

/** Criação de documento por upload de arquivo (multipart). */
export async function uploadDocument(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await checkPermission("tasks.view");
  if (!auth.ok) return { error: auth.error };

  // Vercel tem filesystem efêmero — uploads precisam de storage externo.
  if (process.env.VERCEL) {
    return {
      error:
        "Upload de arquivos indisponível neste ambiente. Configure um storage externo (Vercel Blob/S3) ou use link externo/Google Drive. Veja docs/DEPLOY.md.",
    };
  }

  const title = String(formData.get("title") ?? "").trim();
  if (title.length < 3) return { error: "Título muito curto." };
  const type = String(formData.get("type") ?? "OUTRO");
  const documentType = (DOCUMENT_TYPES as readonly string[]).includes(type) ? type : "OUTRO";
  const description = String(formData.get("description") ?? "").trim() || null;
  const clientId = String(formData.get("clientId") ?? "") || null;
  const taskId = String(formData.get("taskId") ?? "") || null;
  const digitalAssetId = String(formData.get("digitalAssetId") ?? "") || null;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Selecione um arquivo." };
  if (file.size > MAX_FILE_SIZE) return { error: "Arquivo muito grande (limite 25MB)." };

  const safeName = file.name.replace(/[^\w.\-À-ú ]/g, "_").slice(0, 120);
  const storageName = `${crypto.randomUUID()}__${safeName}`;
  await mkdir(UPLOADS_DIR, { recursive: true });
  await writeFile(join(UPLOADS_DIR, storageName), Buffer.from(await file.arrayBuffer()));

  const [doc] = await db
    .insert(documents)
    .values({
      title,
      description,
      type: documentType as (typeof DOCUMENT_TYPES)[number],
      sourceType: "UPLOAD",
      storagePath: storageName,
      mimeType: file.type || null,
      clientId,
      taskId,
      digitalAssetId,
      createdById: auth.session.userId,
      updatedById: auth.session.userId,
    })
    .returning();
  await db.update(documents).set({ fileUrl: `/documentos/arquivo/${doc.id}` }).where(eq(documents.id, doc.id));

  await logActivity({
    userId: auth.session.userId,
    action: "document.created",
    entityType: clientId ? "client" : "document",
    entityId: clientId || doc.id,
    metadata: { title, documentId: doc.id, sourceType: "UPLOAD", fileName: safeName },
  });
  revalidateDoc(doc.id, clientId);
  return { success: "Arquivo enviado.", documentId: doc.id };
}

export async function toggleArchiveDocument(documentId: string): Promise<ActionState> {
  const auth = await checkPermission("tasks.view");
  if (!auth.ok) return { error: auth.error };
  const doc = await db.query.documents.findFirst({ where: eq(documents.id, documentId) });
  if (!doc) return { error: "Documento não encontrado." };
  await db
    .update(documents)
    .set({ isArchived: !doc.isArchived, updatedById: auth.session.userId })
    .where(eq(documents.id, documentId));
  await logActivity({
    userId: auth.session.userId,
    action: doc.isArchived ? "document.unarchived" : "document.archived",
    entityType: "document",
    entityId: documentId,
    metadata: { title: doc.title },
  });
  revalidateDoc(documentId, doc.clientId);
  return { success: doc.isArchived ? "Documento restaurado." : "Documento arquivado." };
}

export async function deleteDocument(documentId: string): Promise<ActionState> {
  const auth = await checkPermission("tasks.view");
  if (!auth.ok) return { error: auth.error };
  const doc = await db.query.documents.findFirst({ where: eq(documents.id, documentId) });
  if (!doc) return { error: "Documento não encontrado." };
  if (doc.storagePath) {
    try {
      await unlink(join(UPLOADS_DIR, doc.storagePath));
    } catch {
      // arquivo já removido do disco — segue
    }
  }
  await db.delete(documents).where(eq(documents.id, documentId));
  await logActivity({
    userId: auth.session.userId,
    action: "document.deleted",
    entityType: "document",
    entityId: documentId,
    metadata: { title: doc.title },
  });
  revalidateDoc(undefined, doc.clientId);
  return { success: "Documento excluído." };
}
