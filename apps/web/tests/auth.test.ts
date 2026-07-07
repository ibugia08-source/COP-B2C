import { beforeAll, describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSessionToken, verifySessionToken } from "@/lib/auth/session";

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
  const payload = {
    userId: "u1",
    name: "Teste",
    email: "t@b2c.com",
    roles: ["GESTOR_TRAFEGO" as const],
  };

  it("cria e verifica token válido", async () => {
    const token = await createSessionToken(payload);
    const decoded = await verifySessionToken(token);
    expect(decoded?.userId).toBe("u1");
    expect(decoded?.roles).toEqual(["GESTOR_TRAFEGO"]);
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
});
