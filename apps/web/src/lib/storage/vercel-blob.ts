import { del, put } from "@vercel/blob";
import type { Storage } from "./index";

/**
 * Driver de produção (Vercel Blob). As chaves armazenadas são as URLs do blob
 * (não adivinháveis). O acesso do usuário SEMPRE passa pela rota autenticada,
 * que verifica ownership e faz stream — a URL nunca é exposta ao cliente.
 */
export class VercelBlobStorage implements Storage {
  async upload(input: { path: string; body: Buffer; contentType: string }) {
    const blob = await put(input.path, input.body, {
      access: "public", // URL pública porém não adivinhável; nunca exposta ao cliente
      contentType: input.contentType,
      addRandomSuffix: true,
    });
    return { url: blob.url, key: blob.url };
  }

  async download(key: string): Promise<Buffer> {
    const res = await fetch(key);
    if (!res.ok) throw new Error(`Falha ao baixar do Blob (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    await del(key);
  }

  async getSignedUrl(key: string): Promise<string> {
    return key; // a própria URL não adivinhável do blob
  }
}
