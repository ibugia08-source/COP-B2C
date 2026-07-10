import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, digitalAssetGroups, digitalAssets, users } from "@/db/schema";
import { hasPermission, requirePermission } from "@/lib/auth/guard";
import { canAccessAsset } from "@/lib/auth/ownership";
import { resolveOptions } from "@/lib/config-options";
import {
  ASSET_COMMENT_TYPE_META,
  ASSET_PLATFORM_LABEL,
  ASSET_PRIORITY_META,
  ASSET_STATUS_META,
  ASSET_TYPE_LABEL,
  formatDate,
  TASK_STATUS_META,
  type Tone,
} from "@/lib/labels";
import { Tabs } from "@/components/ui/overlay";
import {
  Badge,
  Button,
  EmptyState,
  StatusBadge,
  Table,
  Td,
  Th,
  UserAvatar,
} from "@/components/ui/primitives";
import { AssetFormButton } from "../ui";
import {
  AssetCommentForm,
  AssetHeaderControls,
  AttachmentUpload,
  DeleteAttachmentButton,
  SecretsSection,
} from "./ui";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-zinc-800/60 py-2 text-sm last:border-0">
      <span className="shrink-0 text-zinc-500">{label}</span>
      <span className="min-w-0 break-all text-right text-zinc-200">{children}</span>
    </div>
  );
}

function extLink(url: string | null) {
  if (!url) return "—";
  const href = url.startsWith("http") ? url : `https://${url}`;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">
      {url.slice(0, 40)}{url.length > 40 ? "…" : ""} ↗
    </a>
  );
}

function formatBytes(n: number | null): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const AUDIT_LABELS: Record<string, string> = {
  ASSET_CREATED: "Ativo criado",
  ASSET_UPDATED: "Ativo atualizado",
  ASSET_ARCHIVED: "Ativo arquivado/restaurado",
  SECRET_CREATED: "Segredo cadastrado",
  SECRET_UPDATED: "Segredo atualizado",
  SECRET_DELETED: "Segredo excluído",
  SECRET_REVEALED: "🔓 Segredo revelado",
  SECRET_COPIED: "⧉ Segredo copiado",
  ATTACHMENT_UPLOADED: "Anexo enviado",
  ATTACHMENT_DOWNLOADED: "Anexo baixado",
  ATTACHMENT_DELETED: "Anexo removido",
  STATUS_CHANGED: "Status alterado",
  PERMISSION_DENIED: "🚫 Acesso negado",
};

export default async function AtivoDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("digital_assets.view");
  const { id } = await params;

  const asset = await db.query.digitalAssets.findFirst({
    where: eq(digitalAssets.id, id),
    with: {
      group: true,
      client: true,
      ownerUser: true,
      assignedTo: true,
      secrets: { orderBy: (s, { asc: a }) => [a(s.createdAt)] },
      attachments: { with: { uploadedBy: true }, orderBy: (a, { desc }) => [desc(a.createdAt)] },
      comments: { with: { author: true }, orderBy: (c, { desc }) => [desc(c.createdAt)] },
      statusHistory: { with: { changedBy: true }, orderBy: (h, { desc }) => [desc(h.createdAt)] },
      auditLogs: { with: { user: true }, orderBy: (l, { desc }) => [desc(l.createdAt)], limit: 100 },
      tasks: { with: { assignedTo: true }, orderBy: (t, { desc }) => [desc(t.updatedAt)] },
    },
  });
  if (!asset) notFound();

  // escopo de ownership: quem não é OWNER/ADMIN só abre ativos de clientes que gerencia
  if (!(await canAccessAsset(session, asset.id))) redirect("/acesso-negado");

  const can = {
    update: hasPermission(session, "digital_assets.update"),
    archive: hasPermission(session, "digital_assets.archive"),
    create: hasPermission(session, "digital_assets.create"),
    secretsMeta: hasPermission(session, "digital_assets.view_secrets_metadata"),
    reveal: hasPermission(session, "digital_assets.reveal_secrets"),
    copy: hasPermission(session, "digital_assets.copy_secrets"),
    createSecrets: hasPermission(session, "digital_assets.create_secrets"),
    updateSecrets: hasPermission(session, "digital_assets.update_secrets"),
    deleteSecrets: hasPermission(session, "digital_assets.delete_secrets"),
    upload: hasPermission(session, "digital_assets.upload_attachments"),
    download: hasPermission(session, "digital_assets.download_attachments"),
    deleteAsset: hasPermission(session, "digital_assets.delete"),
    audit: hasPermission(session, "digital_assets.view_audit_logs"),
    createTask: hasPermission(session, "tasks.create"),
  };

  const now = new Date();
  const reviewPending = asset.nextReviewAt && asset.nextReviewAt < now;

  const [groups, allClients, allUsers, statusOptionsAll] = await Promise.all([
    db.query.digitalAssetGroups.findMany({ where: eq(digitalAssetGroups.status, "ATIVO"), orderBy: [asc(digitalAssetGroups.name)] }),
    db.select({ id: clients.id, name: clients.name }).from(clients).orderBy(asc(clients.name)),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.isActive, true)).orderBy(asc(users.name)),
    resolveOptions("digital_assets", "status"),
  ]);

  // meta de status (built-in + colunas custom do admin) para badges e select
  const statusMeta: Record<string, { label: string; tone: Tone }> = { ...ASSET_STATUS_META };
  for (const o of statusOptionsAll) statusMeta[o.value] = { label: o.label, tone: o.color };
  const statusOptions = statusOptionsAll.filter((o) => o.isActive).map((o) => ({ value: o.value, label: o.label }));

  // ---------------- abas ----------------

  const visaoGeral = (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <h3 className="mb-2 text-sm font-semibold text-zinc-300">Identificação</h3>
        <Row label="Grupo">{asset.group.name}</Row>
        <Row label="Cliente">
          {asset.client ? (
            <Link href={`/clientes/${asset.client.id}`} className="text-emerald-400 hover:underline">
              {asset.client.name}
            </Link>
          ) : "Interno da agência"}
        </Row>
        <Row label="Tipo">{ASSET_TYPE_LABEL[asset.assetType]}</Row>
        <Row label="Plataforma">{ASSET_PLATFORM_LABEL[asset.platform]}</Row>
        <Row label="Status"><StatusBadge value={asset.status} meta={statusMeta} /></Row>
        <Row label="Prioridade"><StatusBadge value={asset.priority} meta={ASSET_PRIORITY_META} /></Row>
        <Row label="Responsável">{asset.assignedTo?.name ?? "—"}</Row>
        <Row label="Dono">{asset.ownerUser?.name ?? "—"}</Row>
        <Row label="Última checagem">{formatDate(asset.lastCheckedAt)}</Row>
        <Row label="Próxima revisão">
          <span className={reviewPending ? "text-amber-400" : ""}>{formatDate(asset.nextReviewAt)}</span>
        </Row>
      </div>
      <div className="space-y-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h3 className="mb-2 text-sm font-semibold text-zinc-300">Links e identificadores</h3>
          <Row label="Login URL">{extLink(asset.loginUrl)}</Row>
          <Row label="Profile URL">{extLink(asset.profileUrl)}</Row>
          <Row label="Business Manager ID">{asset.businessManagerId ?? "—"}</Row>
          <Row label="Conta de anúncio ID">{asset.adAccountId ?? "—"}</Row>
          <Row label="Página ID">{asset.pageId ?? "—"}</Row>
          <Row label="Perfil ID">{asset.profileId ?? "—"}</Row>
          <Row label="ID externo">{asset.externalId ?? "—"}</Row>
          <Row label="E-mail de recuperação">{asset.recoveryEmail ?? "—"}</Row>
        </div>
        {(asset.notes || asset.description) && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <h3 className="mb-2 text-sm font-semibold text-zinc-300">Observações</h3>
            {asset.description && <p className="mb-2 text-sm text-zinc-400">{asset.description}</p>}
            {asset.notes && <p className="whitespace-pre-wrap text-sm text-zinc-300">{asset.notes}</p>}
          </div>
        )}
        {asset.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {asset.tags.map((t) => <Badge key={t} tone="zinc">#{t}</Badge>)}
          </div>
        )}
      </div>
    </div>
  );

  const credenciais = !can.secretsMeta ? (
    <EmptyState icon="🔒" title="Acesso restrito" description="Seu papel não tem acesso às credenciais deste ativo." />
  ) : (
    <SecretsSection
      assetId={asset.id}
      secrets={asset.secrets.map((s) => ({
        id: s.id,
        secretType: s.secretType,
        label: s.label,
        lastRevealedAt: s.lastRevealedAt ? s.lastRevealedAt.toISOString() : null,
      }))}
      canReveal={can.reveal}
      canCopy={can.copy}
      canCreate={can.createSecrets}
      canUpdate={can.updateSecrets}
      canDelete={can.deleteSecrets}
    />
  );

  const anexos = (
    <div className="space-y-3">
      {can.upload && <AttachmentUpload assetId={asset.id} />}
      {asset.attachments.length === 0 ? (
        <EmptyState icon="📎" title="Nenhum anexo" description="Backups de perfil, prints, documentos e materiais do ativo ficam aqui." />
      ) : (
        <Table
          minWidth="600px"
          head={<><Th>Arquivo</Th><Th>Tipo</Th><Th>Tamanho</Th><Th>Enviado</Th><Th className="text-right">Ações</Th></>}
        >
          {asset.attachments.map((a) => (
            <tr key={a.id} className="hover:bg-zinc-900/60">
              <Td className="text-zinc-200">📎 {a.fileName}</Td>
              <Td className="text-xs text-zinc-500">{a.fileType ?? "—"}</Td>
              <Td className="text-zinc-400">{formatBytes(a.fileSize)}</Td>
              <Td className="text-xs text-zinc-500">
                {a.uploadedBy?.name ?? "—"} · {formatDate(a.createdAt)}
              </Td>
              <Td className="text-right">
                <span className="inline-flex items-center gap-2">
                  {can.download && (
                    <Button size="sm" variant="secondary" href={`/ativos/anexos/${a.id}`}>
                      ⬇ Baixar
                    </Button>
                  )}
                  {can.deleteAsset && <DeleteAttachmentButton attachmentId={a.id} fileName={a.fileName} />}
                </span>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );

  const comentarios = (
    <div className="space-y-4">
      <AssetCommentForm assetId={asset.id} />
      {asset.comments.length === 0 ? (
        <p className="text-sm text-zinc-500">Nenhum registro ainda — use este espaço como diário do ativo.</p>
      ) : (
        asset.comments.map((c) => (
          <div key={c.id} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
            <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <UserAvatar name={c.author?.name ?? "Sistema"} size="sm" />
              <span>{c.author?.name ?? "Sistema"}</span>
              <StatusBadge value={c.type} meta={ASSET_COMMENT_TYPE_META} />
              <span>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(c.createdAt)}</span>
            </div>
            <p className="whitespace-pre-wrap text-sm text-zinc-200">{c.content}</p>
          </div>
        ))
      )}
    </div>
  );

  const historico = asset.statusHistory.length === 0 ? (
    <EmptyState icon="🕐" title="Sem mudanças de status registradas" />
  ) : (
    <Table
      minWidth="600px"
      head={<><Th>De</Th><Th>Para</Th><Th>Motivo</Th><Th>Responsável</Th><Th>Data</Th></>}
    >
      {asset.statusHistory.map((h) => (
        <tr key={h.id} className="hover:bg-zinc-900/60">
          <Td><StatusBadge value={h.oldStatus} meta={statusMeta} /></Td>
          <Td><StatusBadge value={h.newStatus} meta={statusMeta} /></Td>
          <Td className="text-zinc-400">{h.reason ?? "—"}</Td>
          <Td className="text-zinc-400">{h.changedBy?.name ?? "—"}</Td>
          <Td className="text-zinc-400">{formatDate(h.createdAt)}</Td>
        </tr>
      ))}
    </Table>
  );

  const auditoria = !can.audit ? (
    <EmptyState icon="🔒" title="Apenas usuários autorizados podem ver a auditoria" />
  ) : asset.auditLogs.length === 0 ? (
    <EmptyState icon="🛡️" title="Nenhum evento de auditoria" />
  ) : (
    <Table
      minWidth="700px"
      head={<><Th>Ação</Th><Th>Usuário</Th><Th>Detalhe</Th><Th>IP</Th><Th>Quando</Th></>}
    >
      {asset.auditLogs.map((l) => (
        <tr key={l.id} className="hover:bg-zinc-900/60">
          <Td>
            <Badge tone={l.action === "PERMISSION_DENIED" ? "red" : l.action.startsWith("SECRET_REVEALED") || l.action === "SECRET_COPIED" ? "amber" : "zinc"}>
              {AUDIT_LABELS[l.action] ?? l.action}
            </Badge>
          </Td>
          <Td className="text-zinc-300">{l.user?.name ?? "—"}</Td>
          <Td className="max-w-xs truncate text-xs text-zinc-500">
            {l.metadata ? Object.entries(l.metadata).map(([k, v]) => `${k}: ${v}`).join(" · ") : "—"}
          </Td>
          <Td className="text-xs text-zinc-500">{l.ipAddress ?? "—"}</Td>
          <Td className="text-xs text-zinc-500">
            {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(l.createdAt)}
          </Td>
        </tr>
      ))}
    </Table>
  );

  const openTasks = asset.tasks.filter((t) => !["CONCLUIDA", "CANCELADA"].includes(t.status));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold">{asset.title}</h1>
            <StatusBadge value={asset.status} meta={statusMeta} />
            {reviewPending && <Badge tone="amber">⏰ revisão pendente</Badge>}
            {asset.archivedAt && <Badge tone="zinc">arquivado</Badge>}
          </div>
          <p className="mt-1 text-sm text-zinc-400">
            {ASSET_TYPE_LABEL[asset.assetType]} · {ASSET_PLATFORM_LABEL[asset.platform]} · {asset.group.name}
            {asset.client && <> · <Link href={`/clientes/${asset.client.id}`} className="text-emerald-400 hover:underline">{asset.client.name}</Link></>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {can.createTask && (
            <Button size="sm" variant="secondary" href={`/tarefas?nova=1&ativo=${asset.id}${asset.clientId ? `&cliente=${asset.clientId}` : ""}`}>
              + Tarefa
            </Button>
          )}
          {can.update && (
            <AssetFormButton
              asset={asset}
              groups={groups.map((g) => ({ id: g.id, name: g.name }))}
              clients={allClients}
              users={allUsers}
              canCreateSecrets={can.createSecrets}
            />
          )}
        </div>
      </div>

      <div className="mb-5">
        <AssetHeaderControls
          assetId={asset.id}
          status={asset.status}
          statusOptions={statusOptions}
          isArchived={!!asset.archivedAt}
          canUpdate={can.update}
          canArchive={can.archive}
          canCreate={can.create}
        />
      </div>

      {openTasks.length > 0 && (
        <div className="mb-5 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase text-zinc-500">Tarefas vinculadas a este ativo</h3>
          <ul className="space-y-1">
            {openTasks.map((t) => (
              <li key={t.id} className="flex items-center justify-between text-sm">
                <Link href={`/tarefas/${t.id}`} className="text-zinc-200 hover:text-emerald-300">☑ {t.title}</Link>
                <span className="flex items-center gap-2 text-xs">
                  <StatusBadge value={t.status} meta={TASK_STATUS_META} />
                  {t.assignedTo && <UserAvatar name={t.assignedTo.name} size="sm" />}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Tabs
        tabs={[
          { key: "visao", label: "Visão Geral", content: visaoGeral },
          { key: "credenciais", label: "Credenciais", content: credenciais, badge: can.secretsMeta ? asset.secrets.length : undefined },
          { key: "anexos", label: "Anexos", content: anexos, badge: asset.attachments.length },
          { key: "comentarios", label: "Comentários/Logs", content: comentarios, badge: asset.comments.length },
          { key: "historico", label: "Histórico de Status", content: historico },
          { key: "auditoria", label: "Auditoria", content: auditoria },
        ]}
      />
    </div>
  );
}
