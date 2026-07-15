import Link from "next/link";
import { and, asc, desc, eq, like, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { clients, digitalAssets, documents, tasks, users } from "@/db/schema";
import { requireSession } from "@/lib/auth/guard";
import { getGoogleDriveStatus } from "@/lib/google-drive";
import { formatDate } from "@/lib/labels";
import { Badge, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { ArchiveDocumentButton, DOC_SOURCE_LABELS, DOC_TYPE_LABELS, DocumentFormButton } from "./ui";

type Search = Record<string, string | string[] | undefined>;
const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

const SOURCE_TONE: Record<string, "blue" | "amber" | "green" | "purple" | "zinc"> = {
  INTERNAL: "zinc",
  UPLOAD: "green",
  GOOGLE_DRIVE: "amber",
  EXTERNAL_LINK: "blue",
};

export default async function DocumentosPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireSession();
  const sp = await searchParams;

  const filters: SQL[] = [eq(documents.isArchived, str(sp.arquivados) === "1")];
  if (str(sp.tipo)) filters.push(eq(documents.type, str(sp.tipo) as never));
  if (str(sp.origem)) filters.push(eq(documents.sourceType, str(sp.origem) as never));
  if (str(sp.cliente)) filters.push(eq(documents.clientId, str(sp.cliente)!));
  if (str(sp.responsavel)) filters.push(eq(documents.createdById, str(sp.responsavel)!));
  if (str(sp.q)) {
    const pattern = `%${str(sp.q)}%`;
    filters.push(or(like(documents.title, pattern), like(documents.content, pattern), like(documents.description, pattern))!);
  }

  const [rows, allClients, allTasks, allAssets, allUsers, drive] = await Promise.all([
    db.query.documents.findMany({
      where: and(...filters),
      with: { client: true, createdBy: true },
      orderBy: [desc(documents.updatedAt)],
      limit: 200,
    }),
    db.select({ id: clients.id, name: clients.name }).from(clients).orderBy(asc(clients.name)),
    db.select({ id: tasks.id, name: tasks.title }).from(tasks).orderBy(desc(tasks.updatedAt)).limit(300),
    db.select({ id: digitalAssets.id, name: digitalAssets.title }).from(digitalAssets).orderBy(asc(digitalAssets.title)).limit(500),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.isActive, true)).orderBy(asc(users.name)),
    getGoogleDriveStatus(),
  ]);

  const filterLink = (label: string, params: string, active: boolean) => (
    <Link
      href={`/documentos${params ? `?${params}` : ""}`}
      className={`rounded-lg px-2.5 py-1 text-xs transition ${
        active ? "bg-emerald-950/70 text-emerald-300" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
      }`}
    >
      {label}
    </Link>
  );
  const selectClass =
    "rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:border-emerald-600";

  return (
    <div>
      <PageHeader
        title="Documentos"
        description="Wiki, contratos, briefings, uploads e arquivos do Google Drive. Credenciais ficam no Banco de Ativos — nunca aqui."
        actions={
          <DocumentFormButton
            clients={allClients}
            tasks={allTasks}
            assets={allAssets}
            defaultClientId={str(sp.cliente)}
            driveConnected={drive.connected}
            autoOpen={str(sp.novo) === "1"}
          />
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-1">
        {filterLink("Todos", "", !str(sp.tipo) && str(sp.arquivados) !== "1")}
        {Object.entries(DOC_TYPE_LABELS).map(([v, l]) => filterLink(l, `tipo=${v}`, str(sp.tipo) === v))}
        {filterLink("Arquivados", "arquivados=1", str(sp.arquivados) === "1")}
      </div>

      <form className="mb-4 flex flex-wrap items-center gap-2" action="/documentos">
        <select name="origem" defaultValue={str(sp.origem) ?? ""} className={selectClass}>
          <option value="">Origem: todas</option>
          {Object.entries(DOC_SOURCE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select name="cliente" defaultValue={str(sp.cliente) ?? ""} className={selectClass}>
          <option value="">Cliente: todos</option>
          {allClients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select name="responsavel" defaultValue={str(sp.responsavel) ?? ""} className={selectClass}>
          <option value="">Responsável: todos</option>
          {allUsers.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
        <input
          name="q"
          defaultValue={str(sp.q) ?? ""}
          placeholder="Buscar documentos..."
          className={`${selectClass} w-48`}
        />
        <button type="submit" className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500 hover:text-white">
          Filtrar
        </button>
        {(str(sp.origem) || str(sp.cliente) || str(sp.responsavel) || str(sp.q)) && (
          <Link href="/documentos" className="rounded-lg px-2 py-1.5 text-xs text-zinc-500 hover:text-white">Limpar</Link>
        )}
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon="documents"
          title="Nenhum documento encontrado"
          description="Crie o primeiro documento (texto, upload, link ou Google Drive) ou ajuste os filtros."
          action={<DocumentFormButton clients={allClients} tasks={allTasks} assets={allAssets} driveConnected={drive.connected} />}
        />
      ) : (
        <Table
          minWidth="820px"
          head={
            <>
              <Th>Documento</Th>
              <Th>Tipo</Th>
              <Th>Origem</Th>
              <Th>Cliente</Th>
              <Th>Atualizado</Th>
              <Th className="text-right">Ações</Th>
            </>
          }
        >
          {rows.map((d) => {
            const isExternal = d.sourceType !== "INTERNAL" && !!d.fileUrl;
            return (
              <tr key={d.id} className="hover:bg-zinc-900/60">
                <Td>
                  <Link href={`/documentos/${d.id}`} className="font-medium text-zinc-100 hover:text-emerald-300">
                    {d.title}
                  </Link>
                  {d.createdBy && <p className="text-xs text-zinc-500">por {d.createdBy.name}</p>}
                </Td>
                <Td><Badge tone="blue">{DOC_TYPE_LABELS[d.type] ?? d.type}</Badge></Td>
                <Td><Badge tone={SOURCE_TONE[d.sourceType] ?? "zinc"}>{DOC_SOURCE_LABELS[d.sourceType] ?? d.sourceType}</Badge></Td>
                <Td className="text-zinc-400">
                  {d.client ? (
                    <Link href={`/clientes/${d.client.id}`} className="hover:text-emerald-300">{d.client.name}</Link>
                  ) : "—"}
                </Td>
                <Td className="text-zinc-400">{formatDate(d.updatedAt)}</Td>
                <Td className="text-right">
                  <span className="inline-flex items-center gap-2">
                    {isExternal && (
                      <a href={d.fileUrl!} target="_blank" rel="noreferrer" className="text-xs text-emerald-400 hover:underline">
                        abrir <Icon name="externalLink" />
                      </a>
                    )}
                    <ArchiveDocumentButton documentId={d.id} isArchived={d.isArchived} />
                  </span>
                </Td>
              </tr>
            );
          })}
        </Table>
      )}
    </div>
  );
}
