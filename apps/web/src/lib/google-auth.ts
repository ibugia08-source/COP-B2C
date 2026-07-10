/**
 * Autenticação com as APIs do Google via conta robô da agência.
 *
 * O refresh token (gerado uma única vez no OAuth Playground) é trocado por um
 * access token de curta duração a cada ~1h. O token fica em cache de módulo —
 * em serverless cada instância mantém o seu, o que é suficiente porque a troca
 * é barata e idempotente.
 *
 * Nunca lança: devolve `{ ok: false, error }` com mensagem amigável, seguindo o
 * contrato das integrações opcionais (google-drive.ts / google-meet.ts).
 */

export type GoogleAuthResult = { ok: true; accessToken: string } | { ok: false; error: string };

const TOKEN_URL = "https://oauth2.googleapis.com/token";
/** Margem para não usar um token a segundos de expirar. */
const EXPIRY_SLACK_MS = 60_000;

let cached: { accessToken: string; expiresAt: number } | null = null;

/** Limpa o cache — usado apenas em testes. */
export function resetGoogleAuthCacheForTests() {
  cached = null;
}

export async function getGoogleAccessToken(): Promise<GoogleAuthResult> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    return {
      ok: false,
      error:
        "Credenciais do Google ausentes no ambiente (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_REFRESH_TOKEN).",
    };
  }

  if (cached && Date.now() < cached.expiresAt) {
    return { ok: true, accessToken: cached.accessToken };
  }

  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
  } catch {
    return { ok: false, error: "Não foi possível contatar o Google (falha de rede). Tente novamente." };
  }

  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };

  if (!res.ok || !data.access_token) {
    // invalid_grant = refresh token revogado/expirado — precisa gerar outro no OAuth Playground.
    const hint =
      data.error === "invalid_grant"
        ? "O refresh token do Google expirou ou foi revogado — gere um novo no OAuth Playground e atualize GOOGLE_REFRESH_TOKEN."
        : `O Google recusou as credenciais (${data.error ?? res.status}). Verifique GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN.`;
    return { ok: false, error: hint };
  }

  cached = {
    accessToken: data.access_token,
    expiresAt: Date.now() + Math.max(0, (data.expires_in ?? 3600) * 1000 - EXPIRY_SLACK_MS),
  };
  return { ok: true, accessToken: data.access_token };
}
