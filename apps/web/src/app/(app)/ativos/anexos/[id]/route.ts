import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { digitalAssetAttachments } from "@/db/schema";
import { writeAssetAudit } from "@/lib/assets/audit";
import { checkPermission } from "@/lib/auth/guard";

const UPLOADS_DIR = join(process.cwd(), "uploads", "ativos");

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await checkPermission("digital_assets.download_attachments");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  const { id } = await ctx.params;
  const attachment = await db.query.digitalAssetAttachments.findFirst({
    where: eq(digitalAssetAttachments.id, id),
  });
  if (!attachment) return NextResponse.json({ error: "Anexo não encontrado" }, { status: 404 });

  const filePath = join(UPLOADS_DIR, attachment.storagePath);
  if (!existsSync(filePath)) {
    return NextResponse.json({ error: "Arquivo não encontrado no armazenamento" }, { status: 404 });
  }

  await writeAssetAudit({
    assetId: attachment.assetId,
    userId: auth.session.userId,
    action: "ATTACHMENT_DOWNLOADED",
    metadata: { fileName: attachment.fileName },
  });

  const { size } = await stat(filePath);
  const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
  return new NextResponse(stream, {
    headers: {
      "Content-Type": attachment.fileType || "application/octet-stream",
      "Content-Length": String(size),
      "Content-Disposition": `attachment; filename="${encodeURIComponent(attachment.fileName)}"`,
    },
  });
}
