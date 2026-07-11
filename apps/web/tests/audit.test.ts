import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { encryptSecret } from "@/lib/crypto";

// P0.10 — auditoria transacional: se o INSERT em digital_asset_audit_logs
// falhar durante revealSecret, a transação reverte e o plaintext NÃO sai.

const SECRET_ID = "sec-1";
const ASSET_ID = "asset-1";
const PLAINTEXT = "senha-super-secreta";

// controla o comportamento do INSERT de auditoria dentro da transação
let auditInsertFails = false;
let updateRan = false;

vi.mock("@/db", () => {
  const tx = {
    update: () => ({
      set: () => ({
        where: async () => {
          updateRan = true;
        },
      }),
    }),
    insert: () => ({
      values: async () => {
        if (auditInsertFails) throw new Error("db de auditoria indisponível");
      },
    }),
  };
  const db = {
    query: {
      digitalAssetSecrets: {
        findFirst: async () => ({
          id: SECRET_ID,
          assetId: ASSET_ID,
          secretType: "PASSWORD",
          label: "Senha",
          encryptedValue: encryptSecret(PLAINTEXT, { secretId: SECRET_ID, assetId: ASSET_ID }),
          asset: { title: "BM Principal" },
        }),
      },
      digitalAssets: { findFirst: async () => ({ id: ASSET_ID, clientId: null }) },
    },
    transaction: async (fn: (t: typeof tx) => Promise<void>) => {
      // como numa transação real: se o callback lançar, nada persiste
      await fn(tx);
    },
    insert: tx.insert,
    update: tx.update,
  };
  return { db };
});

vi.mock("@/lib/auth/guard", () => ({
  checkPermission: async () => ({
    ok: true,
    session: { userId: "u1", name: "Admin", email: "a@b.c", roles: ["ADMIN"] },
  }),
}));

vi.mock("@/lib/auth/ownership", () => ({
  canAccessAsset: async () => true,
  canAccessClient: async () => true,
}));

vi.mock("@/lib/notify", () => ({
  notifyRole: async () => {},
  notifyUser: async () => {},
}));

beforeAll(() => {
  process.env.VAULT_ENCRYPTION_KEY = "a".repeat(64);
  process.env.AUTH_SECRET = "segredo-de-teste-bem-longo-para-hs256";
});

beforeEach(() => {
  auditInsertFails = false;
  updateRan = false;
});

// Timeout maior: o import dinâmico de ativos/actions (módulo grande) passa de 5s
// quando a suíte roda em paralelo em máquina sob carga.
describe("revealSecret — auditoria transacional (fail-closed)", () => {
  it("falha de INSERT na auditoria bloqueia a revelação (sem plaintext)", async () => {
    auditInsertFails = true;
    const { revealSecret } = await import("@/app/(app)/ativos/actions");
    const result = await revealSecret(SECRET_ID, "reveal");
    expect(result.value).toBeUndefined();
    expect(result.error).toMatch(/auditoria/i);
  }, 30_000);

  it("com auditoria funcionando, a revelação retorna o valor", async () => {
    const { revealSecret } = await import("@/app/(app)/ativos/actions");
    const result = await revealSecret(SECRET_ID, "reveal");
    expect(result.error).toBeUndefined();
    expect(result.value).toBe(PLAINTEXT);
    expect(updateRan).toBe(true);
  }, 30_000);
});
