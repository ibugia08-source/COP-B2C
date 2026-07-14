import { fileTypeFromBuffer } from "file-type";

// Validação de upload por CONTEÚDO (magic bytes via file-type), não por
// extensão/Content-Type declarados — um .exe renomeado para .png é rejeitado.

/** Extensões permitidas por módulo. */
export const UPLOAD_WHITELISTS = {
  ativos: ["png", "jpg", "webp", "pdf", "txt", "csv", "xlsx", "docx", "mp4"],
  documentos: ["png", "jpg", "webp", "pdf", "txt", "csv", "xlsx", "docx", "mp4"],
  avatars: ["png", "jpg", "webp"],
} as const satisfies Record<string, readonly string[]>;

/** Formatos texto sem assinatura binária — validados por extensão + conteúdo textual. */
const TEXT_EXTENSIONS: Record<string, string> = {
  txt: "text/plain",
  csv: "text/csv",
};

/** Heurística: conteúdo textual não contém NUL nos primeiros 8KB. */
function isProbablyText(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, 8192);
  return !sample.includes(0);
}

export type UploadValidation =
  | { ok: true; ext: string; mime: string }
  | { ok: false; error: string };

export async function validateUpload(input: {
  buffer: Buffer;
  fileName: string;
  allowed: readonly string[];
  maxBytes: number;
}): Promise<UploadValidation> {
  const { buffer, fileName, allowed, maxBytes } = input;
  if (buffer.length === 0) return { ok: false, error: "Arquivo vazio." };
  if (buffer.length > maxBytes) {
    return { ok: false, error: `Arquivo muito grande (limite ${Math.floor(maxBytes / 1024 / 1024)}MB).` };
  }

  const detected = await fileTypeFromBuffer(buffer);
  if (detected) {
    if (!allowed.includes(detected.ext)) {
      return { ok: false, error: `Tipo de arquivo não permitido (${detected.ext}).` };
    }
    return { ok: true, ext: detected.ext, mime: detected.mime };
  }

  // sem assinatura binária: só aceita txt/csv com conteúdo realmente textual
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const textMime = TEXT_EXTENSIONS[ext];
  if (textMime && allowed.includes(ext) && isProbablyText(buffer)) {
    return { ok: true, ext, mime: textMime };
  }
  return { ok: false, error: "Tipo de arquivo não reconhecido ou não permitido." };
}
