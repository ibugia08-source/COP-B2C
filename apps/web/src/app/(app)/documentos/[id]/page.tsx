import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, documents } from "@/db/schema";
import { requireSession } from "@/lib/auth/guard";
import { formatDate } from "@/lib/labels";
import { Badge } from "@/components/ui/primitives";
import { ArchiveDocumentButton, DOC_TYPE_LABELS, DocumentFormButton } from "../ui";

export default async function DocumentoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;

  const [doc, allClients] = await Promise.all([
    db.query.documents.findFirst({
      where: eq(documents.id, id),
      with: { client: true, createdBy: true },
    }),
    db.select({ id: clients.id, name: clients.name }).from(clients).orderBy(asc(clients.name)),
  ]);
  if (!doc) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{doc.title}</h1>
            <Badge tone="blue">{DOC_TYPE_LABELS[doc.type]}</Badge>
            {doc.isArchived && <Badge tone="zinc">arquivado</Badge>}
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            {doc.client && (
              <>
                Cliente:{" "}
                <Link href={`/clientes/${doc.client.id}`} className="text-emerald-400 hover:underline">
                  {doc.client.name}
                </Link>
                {" · "}
              </>
            )}
            {doc.createdBy && <>por {doc.createdBy.name} · </>}
            atualizado em {formatDate(doc.updatedAt)}
          </p>
        </div>
        <div className="flex gap-2">
          <DocumentFormButton document={doc} clients={allClients} />
          <ArchiveDocumentButton documentId={doc.id} isArchived={doc.isArchived} />
        </div>
      </div>

      <article className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
        {doc.content ? (
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-200">{doc.content}</pre>
        ) : (
          <p className="text-sm text-zinc-500">Documento sem conteúdo.</p>
        )}
      </article>
    </div>
  );
}
