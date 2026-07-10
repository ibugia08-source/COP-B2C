import { beforeAll, describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  createSessionToken,
  isSessionUserValid,
  verifySessionToken,
} from "@/lib/auth/session";

beforeAll(() => {
  process.env.AUTH_SECRET = "segredo-de-teste-bem-longo-para-hs256";
});

describe("senha", () => {
  it("hash nunca é a senha em texto puro e verifica corretamente", () => {
    const hash = hashPassword("cop123456");
    expect(hash).not.toContain("cop123456");
    expect(verifyPassword("cop123456", hash)).toBe(true);
    expect(verifyPassword("senha-errada", hash)).toBe(false);
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
