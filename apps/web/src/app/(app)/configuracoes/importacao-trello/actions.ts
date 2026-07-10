"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  digitalAssetComments,
  digitalAssetGroups,
  digitalAssetSecrets,
  digitalAssets,
  importLogs,
  users,
} from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { writeAssetAudit } from "@/lib/assets/audit";
import { checkPermission } from "@/lib/auth/guard";
import { encryptSecret } from "@/lib/crypto";
import { parseTrelloExport, type TrelloPreview } from "@/lib/import/trello";

export type PreviewResult = { error?: string; preview?: SerializablePreview };

// resumo enviável ao client (sem valores de segredos!)
export type SerializablePreview = {
  boardName?: string;
  groups: { name: string; type: string; status: string }[];
  cards: {
    title: string;
    groupName: string;
    status: string;
    assetType: string;
    platform: string;
    secretCount: number;
    commentCount: number;
    attachmentCount: number;
    needsReview: boolean;
  }[];
  totalSecrets: number;
  needsReviewCount: number;
  skipped: { name: string; reason: string }[];
};

function toSerializable(p: TrelloPreview): SerializablePreview {
  return {
    boardName: p.boardName,
    groups: p.groups,
    cards: p.cards.map((c) => ({
      title: c.title,
      groupName: c.groupName,
      status: c.status,
      assetType: c.assetType,
      platform: c.platform,
      secretCount: c.secrets.length,
      commentCount: c.comments.length,
      attachmentCount: c.attachmentLinks.length,
      needsReview: c.needsReview,
    })),
    totalSecrets: p.totalSecrets,
    needsReviewCount: p.needsReviewCount,
    skipped: p.skipped,
  };
}

export async function previewTrelloImport(jsonText: string): Promise<PreviewResult> {
  const auth = await checkPermission("settings.view");
  if (!auth.ok) return { error: auth.error };
  if (!jsonText.trim()) return { error: "Arquivo vazio." };
  if (jsonText.length > 20_000_000) return { error: "Arquivo muito grande (limite 20MB)." };

  const result = parseTrelloExport(jsonText);
  if ("error" in result) return { error: result.error };
  // IMPORTANTE: a prévia enviada ao navegador NÃO contém valores de segredos
  return { preview: toSerializable(result) };
}

export type ImportReport = {
  error?: string;
  groups?: number;
  assets?: number;
  secrets?: number;
  comments?: number;
  skipped?: { name: string; reason: string }[];
};

export async function confirmTrelloImport(jsonText: string, fileName: string): Promise<ImportReport> {
  const auth = await checkPermission("settings.update");
  if (!auth.ok) return { error: auth.error };

  const result = parseTrelloExport(jsonText);
  if ("error" in result) return { error: result.error };

  const allUsers = await db.select({ id: users.id, name: users.name }).from(users);
  const findUser = (name: string | null | undefined): string | null => {
    if (!name) return null;
    const lower = name.toLowerCase();
    return (
      allUsers.find(
        (u) => u.name.toLowerCase().includes(lower) || lower.includes(u.name.split(" ")[0].toLowerCase()),
      )?.id ?? null
    );
  };

  const skipped: { name: string; reason: string }[] = [...result.skipped];
  let groupCount = 0;
  let assetCount = 0;
  let secretCount = 0;
  let commentCount = 0;

  // 1) grupos (dedupe por nome)
  const groupIdByName = new Map<string, string>();
  for (const g of result.groups) {
    const existing = await db.query.digitalAssetGroups.findFirst({
      where: eq(digitalAssetGroups.name, g.name),
    });
    if (existing) {
      groupIdByName.set(g.name, existing.id);
      continue;
    }
    const [created] = await db
      .insert(digitalAssetGroups)
      .values({
        name: g.name,
        type: g.type as never,
        status: g.status as never,
        createdById: auth.session.userId,
      })
      .returning();
    groupIdByName.set(g.name, created.id);
    groupCount++;
  }

  // 2) ativos (dedupe por grupo + título)
  for (const card of result.cards) {
    const groupId = groupIdByName.get(card.groupName);
    if (!groupId) {
      skipped.push({ name: card.title, reason: "grupo não criado" });
      continue;
    }
    const duplicate = await db.query.digitalAssets.findFirst({
      where: and(eq(digitalAssets.groupId, groupId), eq(digitalAssets.title, card.title)),
    });
    if (duplicate) {
      skipped.push({ name: card.title, reason: "já existe ativo com este título no grupo" });
      continue;
    }

    const group = await db.query.digitalAssetGroups.findFirst({ where: eq(digitalAssetGroups.id, groupId) });
    const [asset] = await db
      .insert(digitalAssets)
      .values({
        groupId,
        clientId: group?.clientId ?? null,
        title: card.title,
        assetType: card.assetType,
        platform: card.platform,
        status: card.status,
        loginUrl: card.loginUrl,
        profileId: card.profileId,
        externalId: card.externalId,
        notes: card.notes,
        tags: card.needsReview ? ["precisa-revisar", "importado-trello"] : ["importado-trello"],
        assignedToId: findUser(card.memberNames[0]),
        createdById: auth.session.userId,
      })
      .returning();
    assetCount++;

    // 3) segredos — criptografados na hora; texto puro nunca é persistido
    for (const s of card.secrets) {
      // secretId gerado ANTES para entrar no AAD do GCM
      const secretId = crypto.randomUUID();
      await db.insert(digitalAssetSecrets).values({
        id: secretId,
        assetId: asset.id,
        secretType: s.type,
        label: s.label,
        encryptedValue: encryptSecret(s.value, { secretId, assetId: asset.id }),
        createdById: auth.session.userId,
      });
      secretCount++;
    }

    // 4) comentários (diário do Trello)
    for (const c of card.comments) {
      await db.insert(digitalAssetComments).values({
        assetId: asset.id,
        authorId: findUser(c.author),
        type: "COMENTARIO",
        content: `${c.author ? `[${c.author}` : "[Trello"}${c.date ? ` · ${c.date.slice(0, 10)}` : ""}] ${c.text}`,
      });
      commentCount++;
    }
    if (card.needsReview) {
      await db.insert(digitalAssetComments).values({
        assetId: asset.id,
        type: "ALERTA",
        content: "⚠️ Importado do Trello com conteúdo não estruturado na descrição — revisar e mover credenciais para a aba Credenciais.",
      });
    }
    // anexos do Trello não são baixados automaticamente — registrar os links
    if (card.attachmentLinks.length) {
      await db.insert(digitalAssetComments).values({
        assetId: asset.id,
        type: "OUTRO",
        content: `📎 Anexos no Trello (baixar e re-anexar aqui):\n${card.attachmentLinks.map((a) => `- ${a.name}: ${a.url}`).join("\n")}`,
      });
    }

    await writeAssetAudit({
      assetId: asset.id,
      userId: auth.session.userId,
      action: "ASSET_CREATED",
      metadata: { importedFrom: "trello", secrets: card.secrets.length },
    });
  }

  const [log] = await db
    .insert(importLogs)
    .values({
      source: "TRELLO",
      fileName,
      entity: "digital_assets",
      totalRows: result.cards.length + result.skipped.length,
      importedRows: assetCount,
      skippedRows: skipped.length,
      errorRows: 0,
      report: { groups: groupCount, secrets: secretCount, comments: commentCount, skipped: skipped.slice(0, 100) },
      createdById: auth.session.userId,
    })
    .returning();
  await logActivity({
    userId: auth.session.userId,
    action: "import.completed",
    entityType: "import",
    entityId: log.id,
    metadata: { source: "TRELLO", fileName, assets: assetCount, secrets: secretCount },
  });

  revalidatePath("/ativos");
  return { groups: groupCount, assets: assetCount, secrets: secretCount, comments: commentCount, skipped };
}
