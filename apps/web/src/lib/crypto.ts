import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM para o Cofre de Acessos.
// Formato armazenado: base64(iv):base64(authTag):base64(ciphertext)

function getKey(): Buffer {
  const hex = process.env.VAULT_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "VAULT_ENCRYPTION_KEY ausente ou inválida (precisa de 32 bytes em hex — gere com: openssl rand -hex 32)",
    );
  }
  return Buffer.from(hex, "hex");
}

/**
 * Contexto criptográfico do segredo (AAD do GCM). Vincula o ciphertext ao
 * registro dono: trocar encrypted_value entre linhas do banco quebra a
 * autenticação na decriptação. Gere o secretId (UUID) ANTES de criptografar.
 */
export type SecretAad = { secretId: string; assetId: string };

function aadBuffer(aad: SecretAad): Buffer {
  // ordem fixa das chaves — JSON.stringify segue a ordem do literal
  return Buffer.from(JSON.stringify({ secretId: aad.secretId, assetId: aad.assetId }), "utf8");
}

export function encryptSecret(plaintext: string, aad: SecretAad): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aadBuffer(aad));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":");
}

/**
 * Prévia mascarada para listagens — nunca contém o valor completo.
 * Ex.: "senha-forte-123" → "se•••••••23"; valores curtos viram só "••••••".
 */
export function maskSecret(value: string): string {
  if (value.length < 8) return "••••••";
  return `${value.slice(0, 2)}${"•".repeat(Math.min(value.length - 4, 12))}${value.slice(-2)}`;
}

export function decryptSecret(payload: string, aad: SecretAad): string {
  const key = getKey();
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Payload de segredo inválido");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAAD(aadBuffer(aad));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
