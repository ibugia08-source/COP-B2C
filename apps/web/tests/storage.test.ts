import { describe, expect, it } from "vitest";
import type { Storage } from "@/lib/storage";
import { buildStorageKey, fileNameFromKey } from "@/lib/storage";
import { UPLOAD_WHITELISTS, validateUpload } from "@/lib/storage/validation";

const MAX = 25 * 1024 * 1024;

// PNG mínimo: assinatura + chunk IHDR (o file-type valida além dos 4 primeiros bytes)
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
]);

describe("validateUpload — MIME real por magic bytes", () => {
  it("aceita PNG legítimo mesmo com extensão errada no nome", async () => {
    const result = await validateUpload({
      buffer: PNG,
      fileName: "foto.qualquer",
      allowed: UPLOAD_WHITELISTS.ativos,
      maxBytes: MAX,
    });
    expect(result).toMatchObject({ ok: true, ext: "png", mime: "image/png" });
  });

  it("rejeita executável renomeado para .png (não confia na extensão)", async () => {
    // header MZ (PE/executável Windows)
    const exe = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(200, 0x90)]);
    const result = await validateUpload({
      buffer: exe,
      fileName: "inocente.png",
      allowed: UPLOAD_WHITELISTS.ativos,
      maxBytes: MAX,
    });
    expect(result.ok).toBe(false);
  });

  it("rejeita tipo detectado fora da whitelist (gif)", async () => {
    const gif = Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(50, 0)]);
    const result = await validateUpload({
      buffer: gif,
      fileName: "anim.gif",
      allowed: UPLOAD_WHITELISTS.ativos,
      maxBytes: MAX,
    });
    expect(result.ok).toBe(false);
  });

  it("aceita .txt/.csv com conteúdo textual (sem assinatura binária)", async () => {
    const txt = await validateUpload({
      buffer: Buffer.from("relatório de contas\nlinha 2"),
      fileName: "notas.txt",
      allowed: UPLOAD_WHITELISTS.documentos,
      maxBytes: MAX,
    });
    expect(txt).toMatchObject({ ok: true, ext: "txt", mime: "text/plain" });
    const csv = await validateUpload({
      buffer: Buffer.from("nome;valor\na;1"),
      fileName: "dados.csv",
      allowed: UPLOAD_WHITELISTS.documentos,
      maxBytes: MAX,
    });
    expect(csv).toMatchObject({ ok: true, ext: "csv", mime: "text/csv" });
  });

  it("rejeita binário disfarçado de .txt (bytes NUL)", async () => {
    const fake = Buffer.concat([Buffer.from("texto"), Buffer.from([0x00, 0x00]), Buffer.alloc(10, 7)]);
    const result = await validateUpload({
      buffer: fake,
      fileName: "payload.txt",
      allowed: UPLOAD_WHITELISTS.documentos,
      maxBytes: MAX,
    });
    expect(result.ok).toBe(false);
  });

  it("rejeita arquivo acima do limite e arquivo vazio", async () => {
    const big = await validateUpload({
      buffer: Buffer.concat([PNG, Buffer.alloc(101, 1)]),
      fileName: "grande.png",
      allowed: UPLOAD_WHITELISTS.ativos,
      maxBytes: 100,
    });
    expect(big.ok).toBe(false);
    if (!big.ok) expect(big.error).toMatch(/grande/i);
    const empty = await validateUpload({
      buffer: Buffer.alloc(0),
      fileName: "vazio.png",
      allowed: UPLOAD_WHITELISTS.ativos,
      maxBytes: MAX,
    });
    expect(empty.ok).toBe(false);
  });
});

describe("interface Storage (mock em memória)", () => {
  class MemoryStorage implements Storage {
    files = new Map<string, Buffer>();
    async upload(input: { path: string; body: Buffer; contentType: string }) {
      this.files.set(input.path, input.body);
      return { url: `mem://${input.path}`, key: input.path };
    }
    async download(key: string) {
      const found = this.files.get(key);
      if (!found) throw new Error("não encontrado");
      return found;
    }
    async delete(key: string) {
      this.files.delete(key);
    }
    async getSignedUrl(key: string) {
      return `mem://${key}`;
    }
  }

  it("roundtrip upload → download → delete com chave gerada", async () => {
    const storage = new MemoryStorage();
    const { key, safeName } = buildStorageKey("ativos", "print da BM!!.png");
    expect(key).toMatch(/^ativos\/[0-9a-f-]{36}__/);
    expect(safeName).not.toContain("!");

    await storage.upload({ path: key, body: PNG, contentType: "image/png" });
    expect((await storage.download(key)).equals(PNG)).toBe(true);

    await storage.delete(key);
    await expect(storage.download(key)).rejects.toThrow();
  });

  it("fileNameFromKey recupera o nome amigável", () => {
    const { key } = buildStorageKey("documentos", "contrato final.pdf");
    expect(fileNameFromKey(key, "fallback")).toBe("contrato final.pdf");
    expect(fileNameFromKey("sem-separador", "fallback")).toBe("fallback");
  });
});
