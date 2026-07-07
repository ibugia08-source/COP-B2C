import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { activityLogs } from "@/db/schema";
import { CLIENT_STATUS_META, HEALTH_META, PIPELINE_STAGE_META } from "@/lib/labels";

export type TimelineItem = {
  date: Date;
  icon: string;
  title: string;
  detail?: string;
  kind: "status" | "saude" | "tarefa" | "reuniao" | "criativo" | "ativo" | "documento" | "outro";
};

const ACTION_LABELS: Record<string, { icon: string; label: string; kind: TimelineItem["kind"] }> = {
  "client.created": { icon: "✨", label: "Cliente criado", kind: "outro" },
  "client.updated": { icon: "✏️", label: "Ficha atualizada", kind: "outro" },
  "client.statusChanged": { icon: "🔄", label: "Status alterado", kind: "status" },
  "client.stageChanged": { icon: "🧭", label: "Etapa do pipeline alterada", kind: "status" },
  "client.healthChanged": { icon: "❤️‍🩹", label: "Saúde da conta alterada", kind: "saude" },
  "client.responsiblesChanged": { icon: "👤", label: "Responsáveis alterados", kind: "outro" },
  "client.adsStatusChanged": { icon: "📣", label: "Status de anúncios alterado", kind: "outro" },
  "client.markedLost": { icon: "🚪", label: "Cliente marcado como perdido", kind: "status" },
  "client.meetingRegistered": { icon: "🗓️", label: "Reunião registrada", kind: "reuniao" },
  "client.operationalProfileUpdated": { icon: "🧩", label: "Perfil operacional atualizado", kind: "outro" },
  "client.commentAdded": { icon: "💬", label: "Comentário", kind: "outro" },
  "template.applied": { icon: "📋", label: "Template aplicado", kind: "tarefa" },
  "asset.created": { icon: "🗄️", label: "Ativo digital cadastrado", kind: "ativo" },
  "asset.updated": { icon: "🗄️", label: "Ativo digital atualizado", kind: "ativo" },
  "asset.statusChanged": { icon: "🗄️", label: "Status de ativo alterado", kind: "ativo" },
  "asset.secretAdded": { icon: "🔐", label: "Credencial adicionada (sem exibir valor)", kind: "ativo" },
  "document.created": { icon: "📄", label: "Documento adicionado", kind: "documento" },
};

function describeMetadata(action: string, metadata: Record<string, unknown> | null): string | undefined {
  if (!metadata) return undefined;
  if (action === "client.healthChanged") {
    const from = HEALTH_META[String(metadata.from)]?.label ?? metadata.from;
    const to = HEALTH_META[String(metadata.to)]?.label ?? metadata.to;
    const reason = metadata.reason ? ` — ${metadata.reason}` : "";
    return `${from} → ${to}${reason}`;
  }
  if (action === "client.stageChanged") {
    const from = PIPELINE_STAGE_META[String(metadata.from)]?.label ?? metadata.from;
    const to = PIPELINE_STAGE_META[String(metadata.to)]?.label ?? metadata.to;
    return `${from} → ${to}`;
  }
  if (action === "client.statusChanged") {
    const from = CLIENT_STATUS_META[String(metadata.from)]?.label ?? metadata.from;
    const to = CLIENT_STATUS_META[String(metadata.to)]?.label ?? metadata.to;
    return `${from} → ${to}`;
  }
  if (action === "client.markedLost") return `Motivo: ${metadata.churnReason ?? "não informado"}`;
  if (action === "client.adsStatusChanged") return `${metadata.from} → ${metadata.to}`;
  if (action === "template.applied") return `Template: ${metadata.templateSlug} (${metadata.createdTasks ?? 0} tarefas)`;
  if (action === "client.meetingRegistered") return String(metadata.title ?? "");
  if (action === "client.commentAdded") return String(metadata.comment ?? "");
  if (action.startsWith("asset.")) return metadata.title ? String(metadata.title) : undefined;
  return undefined;
}

/** Timeline unificada do cliente: logs + tarefas + reuniões + criativos + financeiro. */
export async function getClientTimeline(clientId: string, filter?: TimelineItem["kind"]): Promise<TimelineItem[]> {
  const [logs, client] = await Promise.all([
    db.query.activityLogs.findMany({
      where: and(eq(activityLogs.entityType, "client"), eq(activityLogs.entityId, clientId)),
      orderBy: [desc(activityLogs.createdAt)],
      limit: 200,
    }),
    db.query.clients.findFirst({
      where: (c, { eq: eq_ }) => eq_(c.id, clientId),
      with: {
        tasks: { orderBy: (t, { desc: d }) => [d(t.updatedAt)], limit: 50 },
        meetings: true,
        creativeRequests: true,
        healthLogs: true,
      },
    }),
  ]);

  const items: TimelineItem[] = [];

  for (const log of logs) {
    const meta = ACTION_LABELS[log.action] ?? { icon: "•", label: log.action, kind: "outro" as const };
    items.push({
      date: log.createdAt,
      icon: meta.icon,
      title: meta.label,
      detail: describeMetadata(log.action, log.metadata ?? null),
      kind: meta.kind,
    });
  }

  if (client) {
    for (const task of client.tasks) {
      if (task.completedAt) {
        items.push({
          date: task.completedAt,
          icon: "✅",
          title: "Tarefa concluída",
          detail: task.title,
          kind: "tarefa",
        });
      }
    }
    for (const meeting of client.meetings) {
      items.push({
        date: meeting.meetingDate,
        icon: "🗓️",
        title: "Reunião",
        detail: meeting.title + (meeting.summary ? ` — ${meeting.summary}` : ""),
        kind: "reuniao",
      });
    }
    for (const cr of client.creativeRequests) {
      items.push({
        date: cr.createdAt,
        icon: "🎨",
        title: "Criativo solicitado",
        detail: cr.title,
        kind: "criativo",
      });
      if (cr.approvedAt) {
        items.push({
          date: cr.approvedAt,
          icon: "🎉",
          title: "Criativo aprovado",
          detail: cr.title,
          kind: "criativo",
        });
      }
    }
  }

  const filtered = filter ? items.filter((i) => i.kind === filter) : items;
  return filtered.sort((a, b) => b.date.getTime() - a.date.getTime());
}
