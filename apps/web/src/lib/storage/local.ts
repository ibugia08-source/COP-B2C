import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";
import type { Storage } from "./index";

/** Driver de dev: grava em apps/web/uploads/<key>. Não funciona na Vercel. */
export class LocalStorage implements Storage {
  private baseDir = join(process.cwd(), "uploads");

  private resolve(key: string): string {
    const full = normalize(join(this.baseDir, key));
    // path traversal na chave nunca deve escapar de uploads/
    if (!full.startsWith(this.baseDir + sep)) {
      throw new Error("Chave de storage inválida");
    }
    return full;
  }

  async upload(input: { path: string; body: Buffer; contentType: string }) {
    const full = this.resolve(input.path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, input.body);
    return { url: `/uploads/${input.path}`, key: input.path };
  }

  async download(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.resolve(key));
    } catch {
      // arquivo já removido — idempotente
    }
  }

  async getSignedUrl(): Promise<string> {
    throw new Error("LocalStorage não emite URLs assinadas — use a rota de download autenticada.");
  }
}
