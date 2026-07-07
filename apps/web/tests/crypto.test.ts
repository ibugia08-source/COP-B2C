import { beforeAll, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

beforeAll(() => {
  process.env.VAULT_ENCRYPTION_KEY = "a".repeat(64);
});

describe("cofre — AES-256-GCM", () => {
  it("criptografa e descriptografa (roundtrip)", () => {
    const secret = "minha-senha-super-secreta-123!@#";
    const payload = encryptSecret(secret);
    expect(payload).not.toContain(secret);
    expect(decryptSecret(payload)).toBe(secret);
  });

  it("gera payloads diferentes para o mesmo segredo (IV aleatório)", () => {
    expect(encryptSecret("mesma-senha")).not.toBe(encryptSecret("mesma-senha"));
  });

  it("falha ao adulterar o ciphertext (autenticação GCM)", () => {
    const payload = encryptSecret("senha");
    const [iv, tag, data] = payload.split(":");
    const tampered = [iv, tag, Buffer.from("hackeado!").toString("base64")].join(":");
    expect(() => decryptSecret(tampered)).toThrow();
    expect(() => decryptSecret(`${iv}:${tag}`)).toThrow();
    void data;
  });

  it("rejeita chave ausente ou inválida", () => {
    const original = process.env.VAULT_ENCRYPTION_KEY;
    process.env.VAULT_ENCRYPTION_KEY = "curta";
    expect(() => encryptSecret("x")).toThrow(/VAULT_ENCRYPTION_KEY/);
    process.env.VAULT_ENCRYPTION_KEY = original;
  });
});
