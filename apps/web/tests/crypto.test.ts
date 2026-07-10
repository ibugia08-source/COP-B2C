import { beforeAll, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, type SecretAad } from "@/lib/crypto";

beforeAll(() => {
  process.env.VAULT_ENCRYPTION_KEY = "a".repeat(64);
});

const AAD: SecretAad = { secretId: "sec-1", assetId: "asset-1" };

describe("cofre — AES-256-GCM com AAD", () => {
  it("criptografa e descriptografa (roundtrip) com o mesmo contexto", () => {
    const secret = "minha-senha-super-secreta-123!@#";
    const payload = encryptSecret(secret, AAD);
    expect(payload).not.toContain(secret);
    expect(decryptSecret(payload, AAD)).toBe(secret);
  });

  it("gera payloads diferentes para o mesmo segredo (IV aleatório)", () => {
    expect(encryptSecret("mesma-senha", AAD)).not.toBe(encryptSecret("mesma-senha", AAD));
  });

  it("falha ao adulterar o ciphertext (autenticação GCM)", () => {
    const payload = encryptSecret("senha", AAD);
    const [iv, tag, data] = payload.split(":");
    const tampered = [iv, tag, Buffer.from("hackeado!").toString("base64")].join(":");
    expect(() => decryptSecret(tampered, AAD)).toThrow();
    expect(() => decryptSecret(`${iv}:${tag}`, AAD)).toThrow();
    void data;
  });

  it("falha ao decriptar com AAD errado (contexto de outro registro)", () => {
    const payload = encryptSecret("senha", AAD);
    expect(() => decryptSecret(payload, { secretId: "sec-2", assetId: "asset-1" })).toThrow();
    expect(() => decryptSecret(payload, { secretId: "sec-1", assetId: "asset-2" })).toThrow();
  });

  it("detecta swap de encryptedValue entre registros do banco", () => {
    // atacante com escrita no banco copia o ciphertext do segredo A para o B
    const aadA: SecretAad = { secretId: "sec-A", assetId: "asset-A" };
    const aadB: SecretAad = { secretId: "sec-B", assetId: "asset-B" };
    const payloadA = encryptSecret("senha-do-A", aadA);
    // ao revelar o segredo B, o AAD usado é o de B — a autenticação falha
    expect(() => decryptSecret(payloadA, aadB)).toThrow();
    // o dono legítimo continua conseguindo ler
    expect(decryptSecret(payloadA, aadA)).toBe("senha-do-A");
  });

  it("rejeita chave ausente ou inválida", () => {
    const original = process.env.VAULT_ENCRYPTION_KEY;
    process.env.VAULT_ENCRYPTION_KEY = "curta";
    expect(() => encryptSecret("x", AAD)).toThrow(/VAULT_ENCRYPTION_KEY/);
    process.env.VAULT_ENCRYPTION_KEY = original;
  });
});
