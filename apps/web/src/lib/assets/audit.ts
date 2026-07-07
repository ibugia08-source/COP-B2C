import { headers } from "next/headers";
import { db } from "@/db";
import { digitalAssetAuditLogs, type AssetAuditAction } from "@/db/schema";

/**
 * Auditoria do Banco de Ativos Digitais.
 * REGRA DE OURO: nunca passar valores de segredos no metadata —
 * apenas identificadores, labels e tipos.
 */
export async function writeAssetAudit(input: {
  assetId?: string | null;
  userId?: string | null;
  action: AssetAuditAction;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    let ipAddress: string | null = null;
    let userAgent: string | null = null;
    try {
      const h = await headers();
      ipAddress = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip");
      userAgent = h.get("user-agent");
    } catch {
      // fora de contexto de request (scripts/seed) — segue sem ip/ua
    }
    await db.insert(digitalAssetAuditLogs).values({
      assetId: input.assetId ?? null,
      userId: input.userId ?? null,
      action: input.action,
      metadata: input.metadata,
      ipAddress,
      userAgent,
    });
  } catch (err) {
    // Auditoria nunca derruba a operação principal — mas registra no stderr
    // (sem nenhum dado sensível, pois metadata nunca contém segredos).
    console.error("Falha ao gravar auditoria de ativo:", err);
  }
}
