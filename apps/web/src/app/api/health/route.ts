import { NextResponse } from "next/server";

// Health check público (monitoramento/uptime). Não toca no banco nem expõe
// detalhes do ambiente — só confirma que o app responde.
export async function GET() {
  return NextResponse.json({ ok: true, ts: new Date().toISOString() });
}
