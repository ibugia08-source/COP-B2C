import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { checkPermission } from "@/lib/auth/guard";
import { getStorage } from "@/lib/storage";

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

// Serve a foto de perfil de um colaborador. Guardada por "tasks.view" (qualquer
// membro interno) para poder reusar o avatar em outras telas no futuro.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await checkPermission("tasks.view");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });

  const { id } = await ctx.params;
  const user = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!user || !user.avatarUrl) {
    return NextResponse.json({ error: "Sem foto" }, { status: 404 });
  }

  let body: Buffer;
  try {
    body = await getStorage().download(user.avatarUrl);
  } catch {
    return NextResponse.json({ error: "Foto não encontrada no armazenamento" }, { status: 404 });
  }

  const ext = user.avatarUrl.split(".").pop()?.toLowerCase() ?? "";
  const contentType = MIME_BY_EXT[ext] ?? "application/octet-stream";
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(body.length),
      "Cache-Control": "private, max-age=60",
    },
  });
}
