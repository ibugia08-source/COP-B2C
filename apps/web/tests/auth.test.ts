import { beforeAll, describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  assessLoginRateLimit,
  countRecentFailures,
  LOGIN_RATE_LIMIT,
} from "@/lib/auth/rate-limit";
import {
  createSessionToken,
  isSessionUserValid,
  verifySessionToken,
} from "@/lib/auth/session";

beforeAll(() => {
  process.env.AUTH_SECRET = "segredo-de-teste-bem-longo-para-hs256";
});

describe("senha", () => {
  it("hash nunca é a senha em texto puro e verifica corretamente (async)", async () => {
    const hash = await hashPassword("cop123456");
    expect(hash).not.toContain("cop123456");
    await expect(verifyPassword("cop123456", hash)).resolves.toBe(true);
    await expect(verifyPassword("senha-errada", hash)).resolves.toBe(false);
  });
});

describe("sessão JWT", () => {
  const payload = { userId: "u1", sv: 3 };

  it("cria e verifica token válido (payload mínimo: userId + sessionVersion)", async () => {
    const token = await createSessionToken(payload);
    const decoded = await verifySessionToken(token);
    expect(decoded?.userId).toBe("u1");
    expect(decoded?.sv).toBe(3);
    // token não carrega mais nome/e-mail/papéis — são hidratados do banco
    expect(decoded).not.toHaveProperty("roles");
    expect(decoded).not.toHaveProperty("email");
  });

  it("expõe exp/iat para o sliding refresh do proxy", async () => {
    const token = await createSessionToken(payload);
    const decoded = await verifySessionToken(token);
    expect(typeof decoded?.exp).toBe("number");
    expect(typeof decoded?.iat).toBe("number");
  });

  it("rejeita token adulterado", async () => {
    const token = await createSessionToken(payload);
    const tampered = token.slice(0, -4) + "xxxx";
    expect(await verifySessionToken(tampered)).toBeNull();
  });

  it("rejeita token assinado com outro segredo", async () => {
    const token = await createSessionToken(payload);
    process.env.AUTH_SECRET = "outro-segredo-completamente-diferente";
    expect(await verifySessionToken(token)).toBeNull();
    process.env.AUTH_SECRET = "segredo-de-teste-bem-longo-para-hs256";
  });

  it("rejeita token com payload sem userId/sv (formato antigo)", async () => {
    // simula um token do formato antigo (payload com roles em vez de sv)
    const { SignJWT } = await import("jose");
    const legacy = await new SignJWT({ userId: "u1", roles: ["ADMIN"] })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
    expect(await verifySessionToken(legacy)).toBeNull();
  });
});

describe("rate limiting do login", () => {
  const now = new Date("2026-07-09T12:00:00Z");
  const failure = (minutesAgo: number) => ({
    success: false,
    createdAt: new Date(now.getTime() - minutesAgo * 60_000),
  });

  it("6 falhas do mesmo e-mail nos últimos 15 min → bloqueado", () => {
    const attempts = [1, 2, 3, 5, 8, 12].map(failure);
    const emailFailures = countRecentFailures(attempts, now);
    expect(emailFailures).toBe(6);
    expect(assessLoginRateLimit({ emailFailures, ipFailures: 6 })).toEqual({
      blocked: true,
      reason: "email",
    });
  });

  it("5 falhas ainda não bloqueiam (limite é >5)", () => {
    const attempts = [1, 2, 3, 5, 8].map(failure);
    const emailFailures = countRecentFailures(attempts, now);
    expect(emailFailures).toBe(5);
    expect(assessLoginRateLimit({ emailFailures, ipFailures: 5 }).blocked).toBe(false);
  });

  it("falhas fora da janela de 15 min não contam", () => {
    const attempts = [1, 2, 16, 30, 60].map(failure);
    expect(countRecentFailures(attempts, now)).toBe(2);
  });

  it("sucessos não contam como falha (contador zerado após login)", () => {
    const attempts = [
      failure(1),
      { success: true, createdAt: new Date(now.getTime() - 2 * 60_000) },
      failure(3),
    ];
    expect(countRecentFailures(attempts, now)).toBe(2);
  });

  it(">20 falhas por IP bloqueiam mesmo com e-mails variados", () => {
    expect(assessLoginRateLimit({ emailFailures: 0, ipFailures: 21 })).toEqual({
      blocked: true,
      reason: "ip",
    });
    expect(assessLoginRateLimit({ emailFailures: 0, ipFailures: 20 }).blocked).toBe(false);
  });

  it("janela e limites são os documentados (15 min / 5 / 20)", () => {
    expect(LOGIN_RATE_LIMIT.windowMs).toBe(15 * 60_000);
    expect(LOGIN_RATE_LIMIT.maxEmailFailures).toBe(5);
    expect(LOGIN_RATE_LIMIT.maxIpFailures).toBe(20);
  });
});

describe("revogação de sessão (isSessionUserValid)", () => {
  const token = { userId: "u1", sv: 2 };
  const user = { id: "u1", isActive: true, status: "ATIVO", sessionVersion: 2 };

  it("aceita usuário ativo com sessionVersion igual", () => {
    expect(isSessionUserValid(token, user)).toBe(true);
  });

  it("rejeita sessionVersion divergente (papéis/status mudaram após o login)", () => {
    expect(isSessionUserValid(token, { ...user, sessionVersion: 3 })).toBe(false);
  });

  it("rejeita usuário desativado", () => {
    expect(isSessionUserValid(token, { ...user, isActive: false })).toBe(false);
  });

  it("rejeita status não-ATIVO (INATIVO/PENDENTE/REJEITADO)", () => {
    for (const status of ["INATIVO", "PENDENTE", "REJEITADO"]) {
      expect(isSessionUserValid(token, { ...user, status })).toBe(false);
    }
  });

  it("rejeita usuário inexistente ou com id divergente", () => {
    expect(isSessionUserValid(token, null)).toBe(false);
    expect(isSessionUserValid(token, undefined)).toBe(false);
    expect(isSessionUserValid(token, { ...user, id: "u2" })).toBe(false);
  });
});
