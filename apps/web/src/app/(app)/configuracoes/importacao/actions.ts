"use server";

import { like } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { clients, importLogs, users } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { checkPermission } from "@/lib/auth/guard";
import { buildPreview, type ImportPreview } from "@/lib/import/clickup";

export type PreviewResult = { error?: string; preview?: ImportPreview };

export async function previewClickupImport(csvText: string): Promise<PreviewResult> {
  const auth = await checkPermission("settings.view");
  if (!auth.ok) return { error: auth.error };
  if (!csvText.trim()) return { error: "Arquivo vazio." };
  if (csvText.length > 2_000_000) return { error: "Arquivo muito grande (limite 2MB)." };

  const result = buildPreview(csvText);
  if ("error" in result) return { error: result.error };
  return { preview: result };
}

export type ImportReport = {
  error?: string;
  imported?: number;
  skipped?: number;
  errors?: { line: number; name: string; problem: string }[];
};

export async function confirmClickupImport(csvText: string, fileName: string): Promise<ImportReport> {
  const auth = await checkPermission("settings.update");
  if (!auth.ok) return { error: auth.error };

  const result = buildPreview(csvText);
  if ("error" in result) return { error: result.error };

  const allUsers = await db.select({ id: users.id, name: users.name }).from(users);
  const findUser = (name: string | null): string | null => {
    if (!name) return null;
    const lower = name.toLowerCase();
    return allUsers.find((u) => u.name.toLowerCase().includes(lower) || lower.includes(u.name.split(" ")[0].toLowerCase()))?.id ?? null;
  };

  let imported = 0;
  let skipped = 0;
  const errors: { line: number; name: string; problem: string }[] = [];

  for (const row of result.rows) {
    if (row.kind !== "client" || !row.client) {
      skipped++;
      if (row.kind === "invalid") errors.push({ line: row.line, name: row.name || "(sem nome)", problem: row.problem ?? "inválida" });
      continue;
    }
    // dedupe por nome (case-insensitive)
    const existing = await db.query.clients.findFirst({ where: like(clients.name, row.client.name) });
    if (existing) {
      skipped++;
      errors.push({ line: row.line, name: row.client.name, problem: "Já existe cliente com este nome — ignorado" });
      continue;
    }
    try {
      await db.insert(clients).values({
        name: row.client.name,
        agencyBrand: row.client.agencyBrand,
        businessModel: row.client.businessModel,
        niche: row.client.niche,
        city: row.client.city,
        state: row.client.state,
        status: row.client.status,
        pipelineStage: row.client.pipelineStage,
        healthStatus: row.client.healthStatus,
        adsStatus: row.client.adsStatus,
        notes: row.client.notes,
        strategistId: findUser(row.client.estrategista),
        // gestor 1 é o responsável principal; usa "responsável" como fallback.
        trafficManager1Id: findUser(row.client.gestor1) ?? findUser(row.client.responsavel1),
        trafficManager2Id: findUser(row.client.gestor2),
        churnDate: row.client.churn ? new Date() : null,
        churnReason: row.client.churn ? "Importado do ClickUp como perdido (revisar motivo)" : null,
      });
      imported++;
    } catch (err) {
      skipped++;
      errors.push({
        line: row.line,
        name: row.client.name,
        problem: err instanceof Error ? err.message : "Erro ao inserir",
      });
    }
  }

  const [log] = await db
    .insert(importLogs)
    .values({
      source: "CLICKUP",
      fileName,
      entity: "clients",
      totalRows: result.rows.length,
      importedRows: imported,
      skippedRows: skipped,
      errorRows: errors.length,
      report: { errors: errors.slice(0, 100) },
      createdById: auth.session.userId,
    })
    .returning();

  await logActivity({
    userId: auth.session.userId,
    action: "import.completed",
    entityType: "import",
    entityId: log.id,
    metadata: { fileName, imported, skipped },
  });

  revalidatePath("/clientes");
  revalidatePath("/operacao");
  revalidatePath("/configuracoes/importacao");
  return { imported, skipped, errors };
}
