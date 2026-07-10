import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// getFeatureFlags lê o banco — mockamos com as flags ligadas (cada teste pode sobrescrever).
const { flagsMock } = vi.hoisted(() => ({
  flagsMock: { copiloto: false, google_drive: true, google_meet: true },
}));

vi.mock("@/lib/settings", () => ({
  getFeatureFlags: vi.fn(async () => ({ ...flagsMock })),
}));

import { getGoogleAccessToken, resetGoogleAuthCacheForTests } from "@/lib/google-auth";
import { listDriveFiles } from "@/lib/google-drive";
import { createGoogleMeetLink } from "@/lib/google-meet";

const fetchMock = vi.fn();

function tokenResponse(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ access_token: "tok-123", expires_in: 3600, ...overrides }),
  };
}

beforeEach(() => {
  resetGoogleAuthCacheForTests();
  flagsMock.google_drive = true;
  flagsMock.google_meet = true;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("GOOGLE_CLIENT_ID", "client-id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret");
  vi.stubEnv("GOOGLE_REFRESH_TOKEN", "refresh-token");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("getGoogleAccessToken", () => {
  it("troca o refresh token e usa cache na segunda chamada", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse());
    const first = await getGoogleAccessToken();
    const second = await getGoogleAccessToken();
    expect(first).toEqual({ ok: true, accessToken: "tok-123" });
    expect(second).toEqual({ ok: true, accessToken: "tok-123" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falha com mensagem clara sem credenciais no ambiente", async () => {
    vi.stubEnv("GOOGLE_REFRESH_TOKEN", "");
    const result = await getGoogleAccessToken();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("GOOGLE_REFRESH_TOKEN");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("aponta o refresh token expirado quando o Google responde invalid_grant", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: "invalid_grant" }),
    });
    const result = await getGoogleAccessToken();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("OAuth Playground");
  });
});

describe("listDriveFiles", () => {
  it("lista arquivos com a query escapada e mapeia webViewLink", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        files: [
          { id: "a1", name: "Briefing", mimeType: "application/vnd.google-apps.document", webViewLink: "https://docs.google.com/document/d/a1/edit" },
          { id: "b2", name: "Planilha", mimeType: "application/vnd.google-apps.spreadsheet" },
        ],
      }),
    });

    const result = await listDriveFiles("relatório d'agência");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.files).toHaveLength(2);
      expect(result.files[0].url).toBe("https://docs.google.com/document/d/a1/edit");
      // sem webViewLink, cai no link canônico do Drive
      expect(result.files[1].url).toBe("https://drive.google.com/file/d/b2/view");
    }
    const driveUrl = new URL(String(fetchMock.mock.calls[1][0]));
    expect(driveUrl.searchParams.get("q")).toBe("name contains 'relatório d\\'agência' and trashed = false");
  });

  it("retorna erro amigável com a flag desligada, sem chamar a API", async () => {
    flagsMock.google_drive = false;
    const result = await listDriveFiles();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("não conectado");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retorna erro amigável quando a Drive API responde erro", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({}),
    });
    const result = await listDriveFiles();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("403");
  });
});

describe("createGoogleMeetLink", () => {
  it("cria o evento com conferenceData e devolve o hangoutLink", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ hangoutLink: "https://meet.google.com/abc-defg-hij" }),
    });

    const starts = new Date("2026-08-01T14:00:00.000Z");
    const result = await createGoogleMeetLink({ title: "Reunião mensal", startsAt: starts, durationMinutes: 30 });
    expect(result).toEqual({ ok: true, url: "https://meet.google.com/abc-defg-hij" });

    const [calendarUrl, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(calendarUrl).toContain("conferenceDataVersion=1");
    const body = JSON.parse(String(init.body));
    expect(body.summary).toBe("Reunião mensal");
    expect(body.start.dateTime).toBe("2026-08-01T14:00:00.000Z");
    expect(body.end.dateTime).toBe("2026-08-01T14:30:00.000Z");
    expect(body.conferenceData.createRequest.conferenceSolutionKey.type).toBe("hangoutsMeet");
  });

  it("retorna erro amigável com a flag desligada, sem chamar a API", async () => {
    flagsMock.google_meet = false;
    const result = await createGoogleMeetLink({ title: "Reunião", startsAt: new Date() });
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("avisa quando o evento é criado sem link de Meet", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    const result = await createGoogleMeetLink({ title: "Reunião", startsAt: new Date("2026-08-01T14:00:00Z") });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("não devolveu o link");
  });
});
