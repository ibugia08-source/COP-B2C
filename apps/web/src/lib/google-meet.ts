import { randomUUID } from "node:crypto";
import { getGoogleAccessToken } from "@/lib/google-auth";
import { getFeatureFlags } from "@/lib/settings";

/**
 * Camada de integração com Google Meet / Google Calendar.
 *
 * A integração é OPCIONAL: enquanto não houver OAuth do Google configurado, o
 * botão "Gerar link Google Meet" fica desabilitado com aviso, e o link continua
 * podendo ser colado manualmente. Nada no sistema quebra sem a integração.
 *
 * Para habilitar, configure no ambiente (local e Vercel):
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   GOOGLE_REDIRECT_URI        (ex.: https://SEU_DOMINIO/api/google/callback)
 *   GOOGLE_REFRESH_TOKEN       (conta de serviço/robô da agência)
 * e ligue a flag "Google Meet" em Configurações → Serviços & Módulos.
 */

export function isGoogleConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN,
  );
}

export async function isGoogleMeetEnabled(): Promise<boolean> {
  const flags = await getFeatureFlags();
  return flags.google_meet && isGoogleConfigured();
}

export type MeetResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * Cria um evento no Google Calendar (agenda primária da conta robô) com
 * conferência Meet e devolve o link. Retorna erro amigável, sem lançar.
 */
export async function createGoogleMeetLink(input: {
  title: string;
  startsAt: Date;
  durationMinutes?: number;
  attendees?: string[];
}): Promise<MeetResult> {
  if (!(await isGoogleMeetEnabled())) {
    return {
      ok: false,
      error:
        "Integração com Google Meet não configurada. Ligue a flag em Configurações → Serviços & Módulos e defina as credenciais do Google (veja docs/DEPLOY.md). Você pode colar o link manualmente.",
    };
  }

  const auth = await getGoogleAccessToken();
  if (!auth.ok) return { ok: false, error: auth.error };

  const starts = Number.isNaN(input.startsAt.getTime()) ? new Date() : input.startsAt;
  const ends = new Date(starts.getTime() + (input.durationMinutes ?? 60) * 60_000);

  let res: Response;
  try {
    res = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${auth.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: input.title,
          start: { dateTime: starts.toISOString() },
          end: { dateTime: ends.toISOString() },
          attendees: input.attendees?.map((email) => ({ email })),
          conferenceData: {
            createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } },
          },
        }),
      },
    );
  } catch {
    return { ok: false, error: "Não foi possível contatar o Google Calendar (falha de rede). Tente novamente." };
  }

  const event = (await res.json().catch(() => ({}))) as {
    hangoutLink?: string;
    conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
  };
  if (!res.ok) {
    return { ok: false, error: `O Google Calendar respondeu com erro (${res.status}). Tente novamente em instantes.` };
  }

  const url =
    event.hangoutLink ??
    event.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri;
  if (!url) {
    return { ok: false, error: "O evento foi criado, mas o Google não devolveu o link do Meet. Cole o link manualmente." };
  }
  return { ok: true, url };
}
