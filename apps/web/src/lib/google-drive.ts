import { getGoogleAccessToken } from "@/lib/google-auth";
import { isGoogleConfigured } from "@/lib/google-meet";
import { getFeatureFlags } from "@/lib/settings";

/**
 * Camada de integração com o Google Drive.
 *
 * A integração é OPCIONAL: enquanto não houver OAuth do Google configurado, o
 * botão "Selecionar arquivo do Drive" fica desabilitado com aviso, mas o usuário
 * continua podendo colar links do Drive manualmente. Nada no sistema quebra sem
 * a integração.
 *
 * Para habilitar, configure no ambiente (local e Vercel):
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   GOOGLE_REDIRECT_URI        (ex.: https://SEU_DOMINIO/api/google/callback)
 *   GOOGLE_REFRESH_TOKEN       (conta robô da agência com acesso ao Drive)
 * e ligue a flag "Google Drive em Documentos" em Configurações → Serviços & Módulos.
 */

export { isGoogleConfigured };

export async function isGoogleDriveEnabled(): Promise<boolean> {
  const flags = await getFeatureFlags();
  return flags.google_drive && isGoogleConfigured();
}

export type GoogleDriveStatus = {
  configured: boolean; // credenciais OAuth presentes no ambiente
  flagOn: boolean; // flag ligada em Configurações
  connected: boolean; // configurado E ligado
};

export async function getGoogleDriveStatus(): Promise<GoogleDriveStatus> {
  const flags = await getFeatureFlags();
  const configured = isGoogleConfigured();
  return { configured, flagOn: flags.google_drive, connected: configured && flags.google_drive };
}

// ---------------------------------------------------------------------------
// Parsing de links do Google Drive / Docs (funciona sem OAuth)
// ---------------------------------------------------------------------------

export type ParsedDrive = {
  fileId: string | null;
  documentType:
    | "GOOGLE_DOC"
    | "GOOGLE_SHEET"
    | "GOOGLE_SLIDES"
    | "DRIVE_FOLDER"
    | "OUTRO";
  mimeType: string | null;
};

const DRIVE_HOSTS = ["drive.google.com", "docs.google.com"];

export function isGoogleDriveUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return DRIVE_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}

/**
 * Extrai o fileId e infere tipo/mime a partir de uma URL do Drive/Docs.
 * Formatos suportados:
 *   docs.google.com/document/d/<id>/...      → Google Docs
 *   docs.google.com/spreadsheets/d/<id>/...  → Google Sheets
 *   docs.google.com/presentation/d/<id>/...  → Google Slides
 *   drive.google.com/drive/folders/<id>      → Pasta
 *   drive.google.com/file/d/<id>/...         → Arquivo genérico
 *   ...?id=<id>                              → fallback
 */
export function parseDriveUrl(url: string): ParsedDrive {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { fileId: null, documentType: "OUTRO", mimeType: null };
  }
  const path = u.pathname;
  const idFromPath = path.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1];
  const idFromFolder = path.match(/\/folders\/([a-zA-Z0-9_-]+)/)?.[1];
  const idFromQuery = u.searchParams.get("id");
  const fileId = idFromPath ?? idFromFolder ?? idFromQuery ?? null;

  if (path.includes("/document/")) {
    return { fileId, documentType: "GOOGLE_DOC", mimeType: "application/vnd.google-apps.document" };
  }
  if (path.includes("/spreadsheets/")) {
    return { fileId, documentType: "GOOGLE_SHEET", mimeType: "application/vnd.google-apps.spreadsheet" };
  }
  if (path.includes("/presentation/")) {
    return { fileId, documentType: "GOOGLE_SLIDES", mimeType: "application/vnd.google-apps.presentation" };
  }
  if (path.includes("/folders/")) {
    return { fileId, documentType: "DRIVE_FOLDER", mimeType: "application/vnd.google-apps.folder" };
  }
  return { fileId, documentType: "OUTRO", mimeType: null };
}

export type DrivePickResult = { ok: true; files: DriveFile[] } | { ok: false; error: string };
export type DriveFile = { id: string; name: string; url: string; mimeType: string };

/** Escapa aspas simples/contrabarras para a query language do Drive (q=). */
function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * Lista arquivos do Drive da conta robô via Drive API (files.list), mais
 * recentes primeiro; com `query`, filtra por nome. Retorna erro amigável,
 * sem lançar.
 */
export async function listDriveFiles(query?: string): Promise<DrivePickResult> {
  if (!(await isGoogleDriveEnabled())) {
    return {
      ok: false,
      error:
        "Google Drive não conectado. Configure as credenciais do Google e ligue a integração em Configurações → Integrações. Você pode colar o link do Drive manualmente.",
    };
  }

  const auth = await getGoogleAccessToken();
  if (!auth.ok) return { ok: false, error: auth.error };

  const q = query?.trim()
    ? `name contains '${escapeDriveQuery(query.trim())}' and trashed = false`
    : "trashed = false";
  const params = new URLSearchParams({
    q,
    pageSize: "20",
    orderBy: "modifiedTime desc",
    fields: "files(id,name,mimeType,webViewLink)",
  });

  let res: Response;
  try {
    res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { Authorization: `Bearer ${auth.accessToken}` },
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "Não foi possível contatar o Google Drive (falha de rede). Tente novamente." };
  }
  if (!res.ok) {
    return { ok: false, error: `O Google Drive respondeu com erro (${res.status}). Tente novamente em instantes.` };
  }

  const data = (await res.json().catch(() => ({}))) as {
    files?: { id: string; name: string; mimeType: string; webViewLink?: string }[];
  };
  const files: DriveFile[] = (data.files ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    url: f.webViewLink ?? `https://drive.google.com/file/d/${f.id}/view`,
  }));
  return { ok: true, files };
}
