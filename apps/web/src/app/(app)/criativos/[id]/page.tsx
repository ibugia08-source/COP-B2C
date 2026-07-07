import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, creativeRequests, users } from "@/db/schema";
import { hasPermission, requirePermission } from "@/lib/auth/guard";
import { CREATIVE_STATUS_META, formatDate } from "@/lib/labels";
import { Badge, StatusBadge } from "@/components/ui/primitives";
import { CreativeFormButton, CreativeStatusControls, OBJECTIVE_LABELS, PLATFORM_LABELS, TYPE_LABELS } from "../ui";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-zinc-800/60 py-2 text-sm last:border-0">
      <span className="shrink-0 text-zinc-500">{label}</span>
      <span className="text-right text-zinc-200">{children}</span>
    </div>
  );
}

export default async function CriativoDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("tasks.view");
  const { id } = await params;

  const creative = await db.query.creativeRequests.findFirst({
    where: eq(creativeRequests.id, id),
    with: { client: true, assignedTo: true, copyResponsible: true, requestedBy: true },
  });
  if (!creative) notFound();

  const canUpdate = hasPermission(session, "tasks.update");
  const [allUsers, allClients] = await Promise.all([
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.isActive, true)),
    db.select({ id: clients.id, name: clients.name }).from(clients),
  ]);

  const overdue =
    !!creative.dueDate && creative.dueDate < new Date() &&
    ["SOLICITADO", "EM_ROTEIRO", "EM_DESIGN", "EM_EDICAO", "AGUARDANDO_APROVACAO"].includes(creative.status);

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <div className="space-y-5 xl:col-span-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold">{creative.title}</h1>
            <StatusBadge value={creative.status} meta={CREATIVE_STATUS_META} />
            {overdue && <Badge tone="red">atrasado</Badge>}
          </div>
          <p className="mt-1 text-sm text-zinc-400">
            <Link href={`/clientes/${creative.clientId}`} className="text-emerald-400 hover:underline">
              {creative.client.name}
            </Link>
            {creative.objective ? ` · ${OBJECTIVE_LABELS[creative.objective]}` : ""}
            {creative.platform ? ` · ${PLATFORM_LABELS[creative.platform]}` : ""}
            {creative.creativeType ? ` · ${TYPE_LABELS[creative.creativeType]}` : ""}
          </p>
        </div>

        {canUpdate && (
          <div className="flex flex-wrap items-center gap-3">
            <CreativeStatusControls creative={creative} />
            <CreativeFormButton creative={creative} users={allUsers} clients={allClients} />
          </div>
        )}

        {creative.briefing ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <h3 className="mb-1 text-xs font-semibold uppercase text-zinc-500">Briefing</h3>
            <p className="whitespace-pre-wrap text-sm text-zinc-300">{creative.briefing}</p>
          </div>
        ) : (
          <div className="rounded-xl border border-amber-900 bg-amber-950/30 p-4 text-sm text-amber-300">
            ⚠️ Este criativo ainda não tem briefing — ele não pode avançar para EM DESIGN até que o briefing seja preenchido.
          </div>
        )}

        {(creative.offer || creative.cta || creative.observations) && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <Row label="Oferta">{creative.offer ?? "—"}</Row>
            <Row label="CTA">{creative.cta ?? "—"}</Row>
            <Row label="Observações">{creative.observations ?? "—"}</Row>
          </div>
        )}

        {creative.rejectionReason && (
          <div className="rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-300">
            <strong>Reprovado:</strong> {creative.rejectionReason}
          </div>
        )}
        {creative.clientFeedback && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <h3 className="mb-1 text-xs font-semibold uppercase text-zinc-500">Feedback do cliente</h3>
            <p className="whitespace-pre-wrap text-sm text-zinc-300">{creative.clientFeedback}</p>
          </div>
        )}
      </div>

      <aside className="space-y-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase text-zinc-500">Detalhes</h3>
          <Row label="Solicitado por">{creative.requestedBy?.name ?? "—"}</Row>
          <Row label="Copy">{creative.copyResponsible?.name ?? "—"}</Row>
          <Row label="Design/edição">{creative.assignedTo?.name ?? "—"}</Row>
          <Row label="Prazo">
            <span className={overdue ? "text-red-400" : ""}>{formatDate(creative.dueDate)}</span>
          </Row>
          <Row label="Aprovado em">{formatDate(creative.approvedAt)}</Row>
          <Row label="Entregue em">{formatDate(creative.deliveredAt)}</Row>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase text-zinc-500">Links</h3>
          <Row label="Arquivos">
            {creative.fileLinks ? (
              <a href={creative.fileLinks} target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">abrir ↗</a>
            ) : "—"}
          </Row>
          <Row label="Publicado">
            {creative.publishedLink ? (
              <a href={creative.publishedLink} target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">abrir ↗</a>
            ) : "—"}
          </Row>
        </div>
      </aside>
    </div>
  );
}
