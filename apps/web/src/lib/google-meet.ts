import { getFeatureFlags } from "@/lib/settings";

/**
 * Camada de integração com Google Meet / Google Calendar.
 *
 * A integração é OPCIONAL: enquanto não houver OAuth do Google configurado, o
 * botão "Gerar link Google Meet" fica desabilitado com aviso, e o link continua
 * podendo ser colado manualmente. Nada no sistema quebra sem a integração.
 *
 * Para habilitar (fase futura), configure na Vercel:
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
 * Cria um evento no Google Calendar com conferência Meet e devolve o link.
 * Stub até o OAuth estar configurado — retorna erro amigável, sem lançar.
 */
export async function createGoogleMeetLink(_input: {
  title: string;
  startsAt: Date;
  durationMinutes?: number;
  attendees?: string[];
}): Promise<MeetResult> {
  void _input;
  if (!(await isGoogleMeetEnabled())) {
    return {
      ok: false,
      error:
        "Integração com Google Meet não configurada. Ligue a flag em Configurações → Serviços & Módulos e defina as credenciais do Google (veja docs/DEPLOY.md). Você pode colar o link manualmente.",
    };
  }
  // TODO(fase Google): chamar Calendar API com conferenceData e retornar hangoutLink.
  return {
    ok: false,
    error: "Geração automática de link ainda não implementada — cole o link do Meet manualmente por enquanto.",
  };
}
