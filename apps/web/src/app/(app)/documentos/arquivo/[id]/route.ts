import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { checkPermission } from "@/lib/auth/guard";

const UPLOADS_DIR = join(process.cwd(), "uploads", "documentos");

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await checkPermission("tasks.view");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });

  const { id } = await ctx.params;
  const doc = await db.query.documents.findFirst({ where: eq(documents.id, id) });
  if (!doc || !doc.storagePath) return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 });

  const filePath = join(UPLOADS_DIR, doc.storagePath);
  if (!existsSync(filePath)) {
    return NextResponse.json({ error: "Arquivo não encontrado no armazenamento" }, { status: 404 });
  }

  // nome amigável a partir do storagePath ("<uuid>__<nome-original>")
  const fileName = doc.storagePath.split("__").slice(1).join("__") || doc.title;
  const { size } = await stat(filePath);
  const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
  return new NextResponse(stream, {
    headers: {
      "Content-Type": doc.mimeType || "application/octet-stream",
      "Content-Length": String(size),
      "Content-Disposition": `inline; filename="${encodeURIComponent(fileName)}"`,
    },
  });
}
