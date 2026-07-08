import { and, desc, eq, inArray, not } from "drizzle-orm";
import { db } from "@/db";
import { clientMeetings, clients, digitalAssets, tasks } from "@/db/schema";
import { formatDate, HEALTH_META, CLIENT_STATUS_META, PIPELINE_STAGE_META } from "@/lib/labels";

/**
 * Gera relatórios operacionais do Co-piloto em markdown a partir de dados
 * reais da plataforma. O resultado vira um Documento interno vinculado ao
 * cliente — sempre após aprovação do gestor.
 */

export type ReportKind = "RESUMO" | "PLANO_ACAO";

export async function buildClientReport(
  clientId: string,
  kind: ReportKind,
): Promise<{ title: string; markdown: string } | null> {
  const client = await db.query.clients.findFirst({
    where: eq(clients.id, clientId),
    with: {
      trafficManager1: { columns: { name: true } },
      strategist: { columns: { name: true } },
      operationalProfile: { columns: { platforms: true, briefingText: true } },
      healthLogs: { orderBy: (h, { desc: d }) => [d(h.createdAt)], limit: 3, with: { changedBy: { columns: { name: true } } } },
    },
  });
  if (!client) return null;

  const [openTasks, problemAssets, recentMeetings] = await Promise.all([
    db.query.tasks.findMany({
      where: and(eq(tasks.clientId, clientId), not(inArray(tasks.status, ["CONCLUIDA", "CANCELADA"]))),
      columns: { id: true, title: true, status: true, priority: true, dueDate: true },
      orderBy: [desc(tasks.priority)],
      limit: 15,
    }),
    db.query.digitalAssets.findMany({
      where: and(
        eq(digitalAssets.clientId, clientId),
        inArray(digitalAssets.status, ["BLOQUEADA", "PRECISA_DE_DOCUMENTOS"]),
      ),
      columns: { id: true, title: true, status: true },
    }),
    db.query.clientMeetings.findMany({
      where: eq(clientMeetings.clientId, clientId),
      columns: { title: true, meetingDate: true, status: true, nextSteps: true },
      orderBy: [desc(clientMeetings.meetingDate)],
      limit: 3,
    }),
  ]);

  const now = new Date();
  const overdue = openTasks.filter((t) => t.dueDate && t.dueDate < now);
  const health = HEALTH_META[client.healthStatus]?.label ?? client.healthStatus;
  const status = CLIENT_STATUS_META[client.status]?.label ?? client.status;
  const stage = PIPELINE_STAGE_META[client.pipelineStage]?.label ?? client.pipelineStage;

  const lines: string[] = [];
  const isPlan = kind === "PLANO_ACAO";
  const title = isPlan
    ? `Plano de ação — ${client.name} (${formatDate(now)})`
    : `Resumo operacional — ${client.name} (${formatDate(now)})`;

  lines.push(`# ${title}`, "");
  lines.push(`**Status:** ${status} · **Saúde:** ${health} · **Etapa:** ${stage}`);
  if (client.niche) lines.push(`**Nicho:** ${client.niche}`);
  lines.push(`**Gestor:** ${client.trafficManager1?.name ?? "—"} · **Estrategista:** ${client.strategist?.name ?? "—"}`);
  if (client.operationalProfile?.platforms?.length) {
    lines.push(`**Serviços utilizados:** ${client.operationalProfile.platforms.join(", ")}`);
  }
  lines.push("");

  lines.push(`## Tarefas em aberto (${openTasks.length}${overdue.length ? ` — ${overdue.length} atrasada(s)` : ""})`);
  if (openTasks.length === 0) lines.push("- Nenhuma tarefa em aberto.");
  for (const t of openTasks.slice(0, 10)) {
    const late = t.dueDate && t.dueDate < now ? " ⚠️ ATRASADA" : "";
    lines.push(`- [${t.priority}] ${t.title} (${t.status}${t.dueDate ? `, prazo ${formatDate(t.dueDate)}` : ""})${late}`);
  }
  lines.push("");

  if (problemAssets.length) {
    lines.push("## Ativos digitais com pendência");
    for (const a of problemAssets) {
      lines.push(`- ${a.title} — ${a.status === "BLOQUEADA" ? "🔴 bloqueado" : "📄 precisa de documentos"}`);
    }
    lines.push("");
  }

  if (recentMeetings.length) {
    lines.push("## Últimas reuniões");
    for (const m of recentMeetings) {
      lines.push(`- ${formatDate(m.meetingDate)} — ${m.title} (${m.status})${m.nextSteps ? ` · Próximos passos: ${m.nextSteps}` : ""}`);
    }
    lines.push("");
  }

  if (client.healthLogs.length) {
    lines.push("## Histórico recente de saúde");
    for (const h of client.healthLogs) {
      lines.push(`- ${formatDate(h.createdAt)}: ${h.previousStatus} → ${h.newStatus}${h.reason ? ` — ${h.reason}` : ""} (${h.changedBy?.name ?? "—"})`);
    }
    lines.push("");
  }

  if (isPlan) {
    lines.push("## Plano de ação sugerido");
    if (overdue.length) lines.push(`1. Resolver as ${overdue.length} tarefa(s) atrasada(s) listadas acima (hoje/amanhã).`);
    if (problemAssets.length) lines.push(`${overdue.length ? 2 : 1}. Destravar os ativos com pendência (bloqueio/documentos).`);
    lines.push(`${1 + (overdue.length ? 1 : 0) + (problemAssets.length ? 1 : 0)}. Agendar contato/reunião de alinhamento com o cliente e registrar na ficha.`);
    lines.push(`${2 + (overdue.length ? 1 : 0) + (problemAssets.length ? 1 : 0)}. Reavaliar a saúde da conta após as ações acima e atualizar na plataforma.`);
    lines.push("");
    lines.push("> Documento gerado pelo Co-piloto após aprovação do gestor. Ajuste conforme o contexto.");
  } else {
    lines.push("> Documento gerado pelo Co-piloto após aprovação do gestor, com dados da plataforma.");
  }

  return { title, markdown: lines.join("\n") };
}
