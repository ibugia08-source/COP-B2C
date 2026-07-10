import { headers } from "next/headers";
import { db } from "@/db";
import { digitalAssetAuditLogs, type AssetAuditAction } from "@/db/schema";

/**
 * Auditoria do Banco de Ativos Digitais.
 * REGRA DE OURO: nunca passar valores de segredos no metadata —
 * apenas identificadores, labels e tipos.
 */

type AuditInput = {
  assetId?: string | null;
  userId?: string | null;
  action: AssetAuditAction;
  metadata?: Record<string, unknown>;
};

/** Executor de escrita: o db global ou uma transação (tx) do Drizzle. */
type AuditExecutor = Pick<typeof db, "insert">;

async function requestContext(): Promise<{ ipAddress: string | null; userAgent: string | null }> {
  try {
    const h = await headers();
    return {
      ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip"),
      userAgent: h.get("user-agent"),
    };
  } catch {
    // fora de contexto de request (scripts/seed) — segue sem ip/ua
    return { ipAddress: null, userAgent: null };
  }
}

/**
 * Escrita ESTRITA: lança se o INSERT falhar. Use para ações sensíveis
 * (revelação/cópia de segredo, download de anexo) — de preferência dentro da
 * MESMA transação da ação, para que falha de auditoria reverta a ação.
 */
export async function writeAssetAuditStrict(
  input: AuditInput,
  executor: AuditExecutor = db,
): Promise<void> {
  const { ipAddress, userAgent } = await requestContext();
  await executor.insert(digitalAssetAuditLogs).values({
    assetId: input.assetId ?? null,
    userId: input.userId ?? null,
    action: input.action,
    metadata: input.metadata,
    ipAddress,
    userAgent,
  });
}

/**
 * Escrita best-effort para eventos informativos (criação/edição de ativo,
 * mudança de status): não derruba a operação principal, mas registra a falha
 * em stderr estruturado (sem dados sensíveis) para não perder o sinal.
 */
export async function writeAssetAudit(input: AuditInput): Promise<void> {
  try {
    await writeAssetAuditStrict(input);
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "asset_audit_write_failed",
        action: input.action,
        assetId: input.assetId ?? null,
        userId: input.userId ?? null,
        message: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}
