import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, digitalAssets, documents, tasks } from "@/db/schema";
import { hasPermission, requirePermission } from "@/lib/auth/guard";
import { can, canActOnAll, isAdminGeral } from "@/lib/auth/access";
import { isClientOwner } from "@/lib/auth/ownership";
import { getGoogleDriveStatus } from "@/lib/google-drive";
import { formatDate } from "@/lib/labels";
import { Alert, Badge, buttonClass } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { ArchiveDocumentButton, DeleteDocumentButton, DOC_SOURCE_LABELS, DOC_TYPE_LABELS, DocumentFormButton } from "../ui";

export default async function DocumentoPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("documents.view");
  const { id } = await params;

  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, id),
    with: { client: true, task: true, digitalAsset: true, createdBy: true },
  });
  if (!doc) notFound();

  // Escopo por cliente: documento interno, do próprio autor, de cliente que
  // gerencia, ou com documents.access_all/Admin Geral.
  const canReach =
    isAdminGeral(session) ||
    can(session, "documents.access_all") ||
    !doc.clientId ||
    doc.createdById === session.userId ||
    isClientOwner(session.userId, doc.client);
  if (!canReach) redirect("/acesso-negado");

  const canEdit = canActOnAll(session, "documents.update") || (hasPermission(session, "documents.update") && canReach);
  const canDelete = canActOnAll(session, "documents.delete") || (hasPermission(session, "documents.delete") && canReach);

  const [allClients, allTasks, allAssets, drive] = await Promise.all([
    db.select({ id: clients.id, name: clients.name }).from(clients).orderBy(asc(clients.name)),
    db.select({ id: tasks.id, name: tasks.title }).from(tasks).orderBy(desc(tasks.updatedAt)).limit(300),
    db.select({ id: digitalAssets.id, name: digitalAssets.title }).from(digitalAssets).orderBy(asc(digitalAssets.title)).limit(500),
    getGoogleDriveStatus(),
  ]);

  const isExternal = doc.sourceType !== "INTERNAL" && !!doc.fileUrl;
  const isDrive = doc.sourceType === "GOOGLE_DRIVE";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{doc.title}</h1>
            <Badge tone="blue">{DOC_TYPE_LABELS[doc.type] ?? doc.type}</Badge>
            <Badge tone="zinc">{DOC_SOURCE_LABELS[doc.sourceType] ?? doc.sourceType}</Badge>
            {doc.isArchived && <Badge tone="zinc">arquivado</Badge>}
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            {doc.client && (
              <>
                Cliente:{" "}
                <Link href={`/clientes/${doc.client.id}`} className="text-emerald-400 hover:underline">{doc.client.name}</Link>
                {" · "}
              </>
            )}
            {doc.task && (
              <>
                Tarefa:{" "}
                <Link href={`/tarefas/${doc.task.id}`} className="text-emerald-400 hover:underline">{doc.task.title}</Link>
                {" · "}
              </>
            )}
            {doc.digitalAsset && (
              <>
                Ativo:{" "}
                <Link href={`/ativos/${doc.digitalAsset.id}`} className="text-emerald-400 hover:underline">{doc.digitalAsset.title}</Link>
                {" · "}
              </>
            )}
            {doc.createdBy && <>por {doc.createdBy.name} · </>}
            atualizado em {formatDate(doc.updatedAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isExternal && (
            <a href={doc.fileUrl!} target="_blank" rel="noreferrer" className={buttonClass("primary", "md")}>
              {doc.sourceType === "UPLOAD" ? <>Abrir arquivo <Icon name="externalLink" /></> : <>Abrir <Icon name="externalLink" /></>}
            </a>
          )}
          {canEdit && (
            <DocumentFormButton
              document={doc}
              clients={allClients}
              tasks={allTasks}
              assets={allAssets}
              driveConnected={drive.connected}
            />
          )}
          {canEdit && <ArchiveDocumentButton documentId={doc.id} isArchived={doc.isArchived} />}
          {canDelete && <DeleteDocumentButton documentId={doc.id} />}
        </div>
      </div>

      {doc.description && <p className="mb-4 text-sm text-zinc-400">{doc.description}</p>}

      {isDrive && (
        <div className="mb-4">
          <Alert tone="amber">
            Este documento é um arquivo do Google Drive. O acesso depende das permissões do próprio Google —
            garanta que a pessoa tenha permissão de leitura no Drive. O COP guarda apenas o link e os metadados.
          </Alert>
        </div>
      )}

      {doc.sourceType === "INTERNAL" ? (
        <article className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
          {doc.content ? (
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-200">{doc.content}</pre>
          ) : (
            <p className="text-sm text-zinc-500">Documento sem conteúdo.</p>
          )}
        </article>
      ) : (
        <article className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-sm text-zinc-300">
          <p className="mb-2">
            {doc.sourceType === "UPLOAD"
              ? "Arquivo enviado ao COP B2C."
              : doc.sourceType === "GOOGLE_DRIVE"
                ? "Arquivo hospedado no Google Drive."
                : "Link externo."}
          </p>
          {doc.fileUrl && (
            <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="break-all text-emerald-400 hover:underline">
              {doc.fileUrl} <Icon name="externalLink" />
            </a>
          )}
          {doc.mimeType && <p className="mt-2 text-xs text-zinc-500">Tipo: {doc.mimeType}</p>}
        </article>
      )}
    </div>
  );
}
