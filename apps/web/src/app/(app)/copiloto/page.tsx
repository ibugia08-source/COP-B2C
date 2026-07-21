import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { copilotSuggestions, users } from "@/db/schema";
import { isAdmin, requirePermission } from "@/lib/auth/guard";
import { buildManagerDailyContext } from "@/lib/copilot/context";
import { SUGGESTION_STATUS_META, SUGGESTION_TYPE_LABELS } from "@/lib/copilot/labels";
import { syncCopilotSuggestions } from "@/lib/copilot/suggestions";
import { HEALTH_META, PRIORITY_META } from "@/lib/labels";
import { formatDateOnly } from "@/lib/date";
import { Alert, Badge, Card, EmptyState, PageHeader, StatCard, StatusBadge } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { SuggestionCard, type ActionView, type SuggestionView } from "./ui";

type Search = Record<string, string | string[] | undefined>;
const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

const PRIO_RANK: Record<string, number> = { URGENTE: 0, ALTA: 1, MEDIA: 2, BAIXA: 3 };

// campo de texto editável do payload, por tipo (espelha copiloto/actions.ts)
const EDITABLE_FIELD: Record<string, string> = {
  PREPARE_WHATSAPP_MESSAGE: "message",
  SEND_WHATSAPP_MESSAGE_FUTURE: "message",
  CREATE_TASK_COMMENT: "body",
  CREATE_CLIENT_COMMENT: "comment",
  CREATE_REMINDER: "body",
  CREATE_TASK: "description",
};

// descrição humana do que a ação fará quando aprovada
function describeAction(type: string, p: Record<string, unknown>): string {
  switch (type) {
    case "CREATE_TASK":
      return `Criar a tarefa "${p.title}" (prioridade ${p.priority ?? "MEDIA"}, prazo ${p.dueDays ?? 2} dia(s)).`;
    case "UPDATE_TASK_STATUS":
      return `Mover a tarefa para o status ${p.status}.`;
    case "UPDATE_TASK_PRIORITY":
      return `Alterar a prioridade da tarefa para ${p.priority}.`;
    case "UPDATE_CLIENT_HEALTH":
      return `Alterar a saúde do cliente para ${p.healthStatus}${p.reason ? ` — motivo: ${p.reason}` : ""}.`;
    case "UPDATE_CLIENT_STATUS":
      return `Mover o cliente para a etapa ${p.pipelineStage}.`;
    case "CREATE_CLIENT_COMMENT":
      return "Registrar o comentário abaixo na timeline do cliente.";
    case "CREATE_TASK_COMMENT":
      return "Registrar o comentário abaixo na tarefa.";
    case "CREATE_REMINDER":
      return `Criar o lembrete "${p.title}" nas suas notificações.`;
    case "CREATE_MEETING":
      return `Agendar a reunião "${p.title}" na ficha do cliente.`;
    case "GENERATE_REPORT":
      return p.kind === "PLANO_ACAO"
        ? "Gerar um plano de ação (documento) com os dados da plataforma, vinculado ao cliente."
        : "Gerar um resumo operacional (documento) com os dados da plataforma, vinculado ao cliente.";
    case "PREPARE_WHATSAPP_MESSAGE":
      return "Preparar a mensagem abaixo para você revisar e enviar manualmente (nada é enviado pelo sistema).";
    case "SEND_WHATSAPP_MESSAGE_FUTURE":
      return "Enviar mensagem pelo WhatsApp — indisponível até a integração oficial.";
    case "LINK_CONVERSATION_TO_CLIENT":
      return "Vincular a conversa monitorada (e seus resumos) ao cliente.";
    default:
      return "Ação do Co-piloto.";
  }
}

export default async function CopilotoPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requirePermission("tasks.view");
  const sp = await searchParams;
  const admin = isAdmin(session);

  // Admin pode inspecionar o Co-piloto de outro gestor; usuários comuns só o próprio.
  const targetUserId = admin && str(sp.usuario) ? str(sp.usuario)! : session.userId;
  const viewingOther = targetUserId !== session.userId;

  const [ctx, allUsers, targetUser] = await Promise.all([
    buildManagerDailyContext(targetUserId),
    admin
      ? db.select({ id: users.id, name: users.name }).from(users).where(eq(users.isActive, true)).orderBy(users.name)
      : Promise.resolve([]),
    viewingOther ? db.query.users.findFirst({ where: eq(users.id, targetUserId), columns: { name: true } }) : Promise.resolve(null),
  ]);

  // gera sugestões do dia (idempotente — rejeitadas não reaparecem)
  await syncCopilotSuggestions(ctx);

  const allSuggestions = await db.query.copilotSuggestions.findMany({
    where: eq(copilotSuggestions.userId, targetUserId),
    with: { client: { columns: { name: true } }, actions: true },
    orderBy: [desc(copilotSuggestions.createdAt)],
    limit: 100,
  });
  const toView = (s: (typeof allSuggestions)[number]): SuggestionView => ({
    id: s.id,
    type: s.type,
    title: s.title,
    description: s.description,
    suggestedAction: s.suggestedAction,
    priority: s.priority,
    status: s.status,
    aiReasoningSummary: s.aiReasoningSummary,
    clientId: s.clientId,
    clientName: s.client?.name ?? null,
    taskId: s.taskId,
    executedTaskId: s.executedTaskId,
    createdAt: s.createdAt.toISOString(),
    actions: s.actions.map((a): ActionView => {
      const payload = (a.payload ?? {}) as Record<string, unknown>;
      const field = EDITABLE_FIELD[a.actionType];
      return {
        id: a.id,
        actionType: a.actionType,
        status: a.status,
        summary: describeAction(a.actionType, payload),
        editableText: field && typeof payload[field] === "string" ? (payload[field] as string) : null,
        errorMessage: a.errorMessage,
        resultSummary: a.resultSummary,
        resultRef: a.resultRef,
      };
    }),
  });
  const pendentes = allSuggestions
    .filter((s) => s.status === "PENDENTE")
    .sort((a, b) => (PRIO_RANK[a.priority] ?? 9) - (PRIO_RANK[b.priority] ?? 9))
    .map(toView);
  const aprovadas = allSuggestions.filter((s) => s.status === "APROVADA").map(toView);
  const historico = allSuggestions
    .filter((s) => ["REJEITADA", "EXECUTADA", "CANCELADA"].includes(s.status))
    .slice(0, 15);

  const attentionClients = [...ctx.criticalClients, ...ctx.observationClients.filter((c) => !ctx.criticalClients.some((k) => k.id === c.id))];

  return (
    <div>
      <PageHeader
        title="Co-piloto"
        description={`Apoio diário do gestor com dados da plataforma${viewingOther && targetUser ? ` — visão de ${targetUser.name}` : ""}. Nada é executado sem a sua aprovação.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {admin && (
              <form action="/copiloto" className="flex items-center gap-1">
                <select
                  name="usuario"
                  defaultValue={targetUserId}
                  className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:border-emerald-600"
                >
                  {allUsers.map((u) => (
                    <option key={u.id} value={u.id}>{u.id === session.userId ? `${u.name} (você)` : u.name}</option>
                  ))}
                </select>
                <button type="submit" className="rounded-lg border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-zinc-500 hover:text-white">
                  Ver
                </button>
              </form>
            )}
            <Link
              href="/copiloto/whatsapp"
              className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white"
            >
              <Icon name="chat" /> WhatsApp & escuta
            </Link>
          </div>
        }
      />

      {/* 1. Resumo do dia */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Clientes na carteira" value={ctx.assignedClients.length} tone="text-sky-400" />
        <StatCard label="Críticos" value={ctx.criticalClients.length} tone="text-red-400" />
        <StatCard label="Tarefas atrasadas" value={ctx.overdueTasks.length} tone="text-red-400" />
        <StatCard label="Vencem hoje" value={ctx.todayTasks.length} tone="text-amber-400" />
        <StatCard label="Solicitações" value={ctx.pendingRequests.length} tone="text-purple-400" />
        <StatCard label="Sugestões pendentes" value={pendentes.length} tone="text-emerald-400" />
      </div>

      <div className="mb-5">
        <Alert tone="amber">
          <Icon name="shield" /> O Co-piloto apenas sugere. Nenhuma mensagem é enviada e nenhuma alteração é feita sem a sua aprovação —
          e toda decisão fica registrada no histórico.
        </Alert>
      </div>

      {/* Núcleo acionável: as sugestões da IA vêm PRIMEIRO (topo, largura total) */}
      <section className="mb-6">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-100">
          <Icon name="robot" /> Sugestões para sua aprovação ({pendentes.length})
        </h2>
        {pendentes.length === 0 ? (
          <EmptyState icon="robot" title="Sem sugestões pendentes" description="O Co-piloto gera sugestões conforme os dados da sua operação mudam." />
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {pendentes.map((s) => <SuggestionCard key={s.id} suggestion={s} />)}
          </div>
        )}
        {aprovadas.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 text-xs font-semibold uppercase text-zinc-500">
              <Icon name="checkCircle" /> Aprovadas — aguardando execução ({aprovadas.length})
            </h3>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
              {aprovadas.map((s) => <SuggestionCard key={s.id} suggestion={s} />)}
            </div>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Coluna 1: prioridades + clientes + alertas */}
        <div className="space-y-4">
          {/* 2. Prioridades recomendadas */}
          <Card className="p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase text-zinc-500"><Icon name="goals" /> Prioridades recomendadas</h3>
            {ctx.suggestedPriorities.length === 0 ? (
              <p className="text-sm text-zinc-500">Sem prioridades críticas hoje. Bom dia de trabalho! <Icon name="sparkles" /></p>
            ) : (
              <ol className="list-inside list-decimal space-y-1.5 text-sm text-zinc-200">
                {ctx.suggestedPriorities.map((p, i) => <li key={i}>{p}</li>)}
              </ol>
            )}
          </Card>

          {/* 3. Clientes que exigem atenção */}
          <Card className="p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase text-zinc-500"><Icon name="alert" /> Clientes que exigem atenção</h3>
            {attentionClients.length === 0 ? (
              <p className="text-sm text-zinc-500">Nenhum cliente crítico ou em observação na sua carteira.</p>
            ) : (
              <ul className="space-y-1.5">
                {attentionClients.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`/clientes/${c.id}`} className="truncate text-zinc-200 hover:text-emerald-300">{c.name}</Link>
                    <span className="flex shrink-0 gap-1">
                      <StatusBadge value={c.healthStatus} meta={HEALTH_META} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* 7. Alertas operacionais */}
          <Card className="p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase text-zinc-500"><Icon name="warning" /> Alertas operacionais</h3>
            <div className="space-y-1.5 text-sm">
              {ctx.blockedDigitalAssets.map((a) => (
                <p key={a.id}>
                  <Icon name="redDot" /> Ativo bloqueado:{" "}
                  <Link href={`/ativos/${a.id}`} className="text-zinc-200 hover:text-emerald-300">{a.title}</Link>
                  {a.clientName && <span className="text-zinc-500"> — {a.clientName}</span>}
                </p>
              ))}
              {ctx.assetsNeedingDocs.map((a) => (
                <p key={a.id}>
                  <Icon name="documents" /> Precisa de documentos:{" "}
                  <Link href={`/ativos/${a.id}`} className="text-zinc-200 hover:text-emerald-300">{a.title}</Link>
                  {a.clientName && <span className="text-zinc-500"> — {a.clientName}</span>}
                </p>
              ))}
              {ctx.goalsAlerts.map((g) => (
                <p key={g.id}>
                  {g.overdue ? <><Icon name="clock" /> Meta vencida:</> : <><Icon name="goals" /> Meta perto do prazo:</>}{" "}
                  <Link href="/metas" className="text-zinc-200 hover:text-emerald-300">{g.title}</Link>
                  <span className="text-zinc-500"> — {formatDateOnly(g.periodEnd)}</span>
                </p>
              ))}
              {ctx.upcomingMeetings.slice(0, 4).map((m) => (
                <p key={m.id}>
                  <Icon name="calendar" /> Reunião:{" "}
                  <Link href={`/clientes/${m.clientId}`} className="text-zinc-200 hover:text-emerald-300">{m.clientName}</Link>
                  <span className="text-zinc-500">
                    {" "}— {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(m.meetingDate)}
                  </span>
                </p>
              ))}
              {ctx.blockedDigitalAssets.length === 0 && ctx.assetsNeedingDocs.length === 0 && ctx.goalsAlerts.length === 0 && ctx.upcomingMeetings.length === 0 && (
                <p className="text-zinc-500">Nenhum alerta operacional agora.</p>
              )}
            </div>
          </Card>
        </div>

        {/* Coluna 2: tarefas e solicitações */}
        <div className="space-y-4">
          {/* 4. Tarefas atrasadas */}
          <Card className="p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase text-zinc-500"><Icon name="clock" /> Tarefas atrasadas ({ctx.overdueTasks.length})</h3>
            {ctx.overdueTasks.length === 0 ? (
              <p className="text-sm text-zinc-500">Nenhuma tarefa atrasada. <Icon name="clap" /></p>
            ) : (
              <ul className="space-y-1.5">
                {ctx.overdueTasks.slice(0, 8).map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`/tarefas/${t.id}`} className="truncate text-zinc-200 hover:text-emerald-300">{t.title}</Link>
                    <span className="flex shrink-0 items-center gap-1.5 text-xs">
                      <StatusBadge value={t.priority} meta={PRIORITY_META} />
                      <span className="text-red-400">{formatDateOnly(t.dueDate)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* 5. Tarefas importantes de hoje */}
          <Card className="p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase text-zinc-500"><Icon name="pin" /> Tarefas de hoje ({ctx.todayTasks.length})</h3>
            {ctx.todayTasks.length === 0 ? (
              <p className="text-sm text-zinc-500">Nada vencendo hoje.</p>
            ) : (
              <ul className="space-y-1.5">
                {ctx.todayTasks.slice(0, 8).map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`/tarefas/${t.id}`} className="truncate text-zinc-200 hover:text-emerald-300">{t.title}</Link>
                    <StatusBadge value={t.priority} meta={PRIORITY_META} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* 6. Solicitações pendentes */}
          <Card className="p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase text-zinc-500"><Icon name="inbox" /> Solicitações feitas a você ({ctx.pendingRequests.length})</h3>
            {ctx.pendingRequests.length === 0 ? (
              <p className="text-sm text-zinc-500">Nenhuma solicitação aberta de outras pessoas.</p>
            ) : (
              <ul className="space-y-1.5">
                {ctx.pendingRequests.slice(0, 8).map((t) => (
                  <li key={t.id} className="text-sm">
                    <Link href={`/tarefas/${t.id}`} className="text-zinc-200 hover:text-emerald-300">{t.title}</Link>
                    <span className="text-xs text-zinc-500"> — pedido por {t.createdByName ?? "—"}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Documentos vinculados recentes */}
          {ctx.recentDocuments.length > 0 && (
            <Card className="p-4">
              <h3 className="mb-2 text-xs font-semibold uppercase text-zinc-500"><Icon name="documents" /> Documentos recentes da carteira</h3>
              <ul className="space-y-1 text-sm">
                {ctx.recentDocuments.map((d) => (
                  <li key={d.id}>
                    <Link href={`/documentos/${d.id}`} className="text-zinc-200 hover:text-emerald-300">{d.title}</Link>
                    {d.clientName && <span className="text-xs text-zinc-500"> — {d.clientName}</span>}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Atividade recente */}
          <Card className="p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase text-zinc-500"><Icon name="clock" /> Atividade recente na carteira</h3>
            {ctx.recentActivity.length === 0 ? (
              <p className="text-sm text-zinc-500">Sem atividade recente registrada.</p>
            ) : (
              <ul className="space-y-1 text-xs text-zinc-400">
                {ctx.recentActivity.map((a) => (
                  <li key={a.id}>
                    <span className="text-zinc-300">{a.userName ?? "Sistema"}</span> · {a.action} ·{" "}
                    {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(a.createdAt)}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Histórico de decisões */}
        <div className="space-y-4">
          <Card className="p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase text-zinc-500"><Icon name="scroll" /> Histórico de decisões</h3>
            {historico.length === 0 ? (
              <p className="text-sm text-zinc-500">Nenhuma decisão registrada ainda.</p>
            ) : (
              <ul className="space-y-1.5">
                {historico.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-zinc-300" title={s.title}>{s.title}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <Badge tone="zinc">{SUGGESTION_TYPE_LABELS[s.type] ?? s.type}</Badge>
                      <StatusBadge value={s.status} meta={SUGGESTION_STATUS_META} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
