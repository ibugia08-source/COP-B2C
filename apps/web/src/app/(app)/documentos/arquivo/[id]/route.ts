import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { checkPermission } from "@/lib/auth/guard";
import { fileNameFromKey, getStorage } from "@/lib/storage";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await checkPermission("tasks.view");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });

  const { id } = await ctx.params;
  const doc = await db.query.documents.findFirst({ where: eq(documents.id, id) });
  if (!doc || !doc.storagePath) return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 });

  let body: Buffer;
  try {
    body = await getStorage().download(doc.storagePath);
  } catch {
    return NextResponse.json({ error: "Arquivo não encontrado no armazenamento" }, { status: 404 });
  }

  const fileName = fileNameFromKey(doc.storagePath, doc.title);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": doc.mimeType || "application/octet-stream",
      "Content-Length": String(body.length),
      "Content-Disposition": `inline; filename="${encodeURIComponent(fileName)}"`,
    },
  });
}
