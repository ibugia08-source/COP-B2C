import { LocalStorage } from "./local";
import { VercelBlobStorage } from "./vercel-blob";

// Abstração de storage de arquivos. Vercel tem filesystem efêmero — em
// produção os uploads vão para o Vercel Blob; em dev, para uploads/ no disco.
// Driver via env STORAGE_DRIVER=local|vercel_blob (default: local em dev,
// vercel_blob em produção). Limite via MAX_UPLOAD_MB (default 25).

export interface Storage {
  upload(input: { path: string; body: Buffer; contentType: string }): Promise<{ url: string; key: string }>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  /** URL de acesso direto (não autenticada). Downloads sensíveis NÃO usam isto —
   *  passam pela rota autenticada que verifica ownership e faz stream. */
  getSignedUrl(key: string, ttlSeconds?: number): Promise<string>;
}

export function maxUploadBytes(): number {
  const mb = Number(process.env.MAX_UPLOAD_MB);
  return (Number.isFinite(mb) && mb > 0 ? mb : 25) * 1024 * 1024;
}

let cached: Storage | null = null;

export function getStorage(): Storage {
  if (cached) return cached;
  const driver =
    process.env.STORAGE_DRIVER ??
    (process.env.NODE_ENV === "production" ? "vercel_blob" : "local");
  if (driver === "vercel_blob") {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      throw new Error(
        "STORAGE_DRIVER=vercel_blob exige BLOB_READ_WRITE_TOKEN (Vercel → Storage → Blob). Veja docs/DEPLOY.md.",
      );
    }
    cached = new VercelBlobStorage();
  } else if (driver === "local") {
    cached = new LocalStorage();
  } else {
    throw new Error(`STORAGE_DRIVER inválido: "${driver}" (use local ou vercel_blob).`);
  }
  return cached;
}

/** Nome de arquivo saneado + chave única no formato "<dir>/<uuid>__<nome>". */
export function buildStorageKey(dir: string, originalName: string): { key: string; safeName: string } {
  const safeName = originalName.replace(/[^\w.\-À-ú ]/g, "_").slice(0, 120);
  return { key: `${dir}/${crypto.randomUUID()}__${safeName}`, safeName };
}

/** Nome original a partir da chave ("<dir>/<uuid>__<nome>"). */
export function fileNameFromKey(key: string, fallback: string): string {
  const base = key.split("/").pop() ?? key;
  return base.split("__").slice(1).join("__") || fallback;
}
