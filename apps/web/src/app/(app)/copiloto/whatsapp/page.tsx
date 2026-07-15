import Link from "next/link";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { clients, conversationSummaries, monitoredConversations, whatsappConnections } from "@/db/schema";
import { requirePermission } from "@/lib/auth/guard";
import { SENTIMENT_META, WHATSAPP_STATUS_META } from "@/lib/copilot/labels";
import { PRIORITY_META } from "@/lib/labels";
import { Alert, Badge, Card, EmptyState, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { AddConversationForm, ConnectButton, SimulateSummaryForm, ToggleConversationButton } from "./ui";

export default async function CopilotoWhatsAppPage() {
  const session = await requirePermission("tasks.view");

  const [connection, conversations, allClients] = await Promise.all([
    db.query.whatsappConnections.findFirst({ where: eq(whatsappConnections.userId, session.userId) }),
    db.query.monitoredConversations.findMany({
      where: eq(monitoredConversations.userId, session.userId),
      with: { client: { columns: { name: true } } },
      orderBy: [desc(monitoredConversations.createdAt)],
    }),
    db.select({ id: clients.id, name: clients.name }).from(clients).orderBy(asc(clients.name)),
  ]);

  const convIds = conversations.map((c) => c.id);
  const summaries = convIds.length
    ? await db.query.conversationSummaries.findMany({
        where: inArray(conversationSummaries.conversationId, convIds),
        with: { conversation: { columns: { displayName: true } }, client: { columns: { id: true, name: true } } },
        orderBy: [desc(conversationSummaries.createdAt)],
        limit: 20,
      })
    : [];

  const status = connection?.status ?? "NAO_CONECTADO";

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="WhatsApp & escuta inteligente"
        description="Conexão voluntária, por usuário e limitada às conversas que você escolher. Nenhuma mensagem é enviada sem a sua aprovação."
      />

      <p className="mb-4 text-sm">
        <Link href="/copiloto" className="text-emerald-400 hover:underline">← Voltar para o Co-piloto</Link>
      </p>

      {/* Conexão */}
      <Card className="mb-5 p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl"><Icon name="chat" /></span>
            <div>
              <h2 className="font-semibold">Conexão WhatsApp comercial</h2>
              <p className="text-xs text-zinc-500">Somente via provedor oficial/autorizado — sem scraping e sem burlar termos de plataforma.</p>
            </div>
          </div>
          <StatusBadge value={status} meta={WHATSAPP_STATUS_META} />
        </div>
        <ConnectButton />
        <div className="mt-4 space-y-1 border-t border-zinc-800 pt-3 text-[11px] text-zinc-500">
          <p>• A conexão é individual e voluntária; você escolhe quais grupos/contatos monitorar (consentimento LGPD).</p>
          <p>• O monitoramento fica limitado às conversas selecionadas abaixo.</p>
          <p>• Nenhuma mensagem é enviada automaticamente — toda resposta passa por sua revisão e aprovação.</p>
        </div>
      </Card>

      {/* Conversas monitoradas */}
      <Card className="mb-5 p-5">
        <h2 className="mb-3 font-semibold">Grupos e contatos monitorados</h2>
        <AddConversationForm clients={allClients} />
        {conversations.length > 0 && (
          <ul className="mt-4 space-y-2">
            {conversations.map((c) => (
              <li key={c.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 ${c.isActive ? "" : "opacity-60"}`}>
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <Badge tone="zinc">{c.type === "GRUPO" ? "Grupo" : "Contato"}</Badge>
                  <span className="truncate text-zinc-200">{c.displayName}</span>
                  {c.client && <span className="text-xs text-zinc-500">→ {c.client.name}</span>}
                  {!c.isActive && <Badge tone="amber">pausado</Badge>}
                </span>
                <ToggleConversationButton conversationId={c.id} isActive={c.isActive} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Simulação de resumo */}
      <Card className="mb-5 p-5">
        <h2 className="mb-1 font-semibold">Simular resumo de conversa</h2>
        <p className="mb-3 text-xs text-zinc-500">
          Enquanto a integração oficial não chega, cole o texto de uma conversa para gerar o resumo com pontos-chave,
          objeções, dúvidas e pendências. Objeções e dúvidas viram sugestões de resposta no Co-piloto — para sua aprovação.
        </p>
        <SimulateSummaryForm
          conversations={conversations.filter((c) => c.displayName !== "Simulação manual").map((c) => ({ id: c.id, name: c.displayName }))}
          clients={allClients}
        />
      </Card>

      {/* Resumos */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-300">Resumos de conversas ({summaries.length})</h2>
        {summaries.length === 0 ? (
          <EmptyState icon="forms" title="Nenhum resumo ainda" description="Use a simulação acima para gerar o primeiro resumo." />
        ) : (
          <div className="space-y-3">
            {summaries.map((s) => (
              <Card key={s.id} className="p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-zinc-100">
                    {s.conversation?.displayName ?? "Conversa"}
                    {s.client && (
                      <Link href={`/clientes/${s.client.id}`} className="text-xs font-normal text-emerald-400 hover:underline">
                        {s.client.name}
                      </Link>
                    )}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <StatusBadge value={s.sentiment} meta={SENTIMENT_META} />
                    <StatusBadge value={s.priority} meta={PRIORITY_META} />
                    <span className="text-[11px] text-zinc-500">
                      {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(s.createdAt)}
                    </span>
                  </span>
                </div>
                <p className="text-sm text-zinc-300">{s.summary}</p>
                <div className="mt-2 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                  {s.keyPoints.length > 0 && (
                    <div>
                      <p className="font-semibold text-zinc-500">Pontos-chave</p>
                      <ul className="list-inside list-disc text-zinc-400">
                        {s.keyPoints.map((k, i) => <li key={i}>{k}</li>)}
                      </ul>
                    </div>
                  )}
                  {s.objections.length > 0 && (
                    <div>
                      <p className="font-semibold text-red-400">Objeções</p>
                      <ul className="list-inside list-disc text-zinc-400">
                        {s.objections.map((k, i) => <li key={i}>{k}</li>)}
                      </ul>
                    </div>
                  )}
                  {s.doubts.length > 0 && (
                    <div>
                      <p className="font-semibold text-amber-400">Dúvidas</p>
                      <ul className="list-inside list-disc text-zinc-400">
                        {s.doubts.map((k, i) => <li key={i}>{k}</li>)}
                      </ul>
                    </div>
                  )}
                  {s.pendingActions.length > 0 && (
                    <div>
                      <p className="font-semibold text-sky-400">Pendências</p>
                      <ul className="list-inside list-disc text-zinc-400">
                        {s.pendingActions.map((k, i) => <li key={i}>{k}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <div className="mt-5">
        <Alert tone="amber">
          <Icon name="lock" /> Nunca cole senhas, tokens ou dados sensíveis em conversas/resumos — credenciais pertencem ao Banco de
          Ativos Digitais. Resumos guardam apenas síntese objetiva.
        </Alert>
      </div>
    </div>
  );
}
