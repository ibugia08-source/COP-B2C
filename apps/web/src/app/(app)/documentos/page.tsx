import Link from "next/link";
import { and, asc, desc, eq, like, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { clients, documents } from "@/db/schema";
import { requireSession } from "@/lib/auth/guard";
import { formatDate } from "@/lib/labels";
import { Badge, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { ArchiveDocumentButton, DOC_TYPE_LABELS, DocumentFormButton } from "./ui";

type Search = Record<string, string | string[] | undefined>;
const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

export default async function DocumentosPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireSession();
  const sp = await searchParams;

  const filters: SQL[] = [eq(documents.isArchived, str(sp.arquivados) === "1")];
  if (str(sp.tipo)) filters.push(eq(documents.type, str(sp.tipo) as never));
  if (str(sp.cliente)) filters.push(eq(documents.clientId, str(sp.cliente)!));
  if (str(sp.q)) {
    const pattern = `%${str(sp.q)}%`;
    filters.push(or(like(documents.title, pattern), like(documents.content, pattern))!);
  }

  const [rows, allClients] = await Promise.all([
    db.query.documents.findMany({
      where: and(...filters),
      with: { client: true, createdBy: true },
      orderBy: [desc(documents.updatedAt)],
      limit: 200,
    }),
    db.select({ id: clients.id, name: clients.name }).from(clients).orderBy(asc(clients.name)),
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

  return (
    <div>
      <PageHeader
        title="Documentos"
        description="Wiki, processos, contratos e briefings. Credenciais ficam no Cofre — nunca aqui."
        actions={
          <DocumentFormButton
            clients={allClients}
            defaultClientId={str(sp.cliente)}
            autoOpen={str(sp.novo) === "1"}
          />
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-1">
        {filterLink("Todos", "", !str(sp.tipo) && str(sp.arquivados) !== "1")}
        {Object.entries(DOC_TYPE_LABELS).map(([v, l]) =>
          filterLink(l, `tipo=${v}`, str(sp.tipo) === v),
        )}
        {filterLink("Arquivados", "arquivados=1", str(sp.arquivados) === "1")}
        <form action="/documentos" className="ml-auto">
          <input
            name="q"
            defaultValue={str(sp.q) ?? ""}
            placeholder="Buscar documentos..."
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 outline-none focus:border-emerald-600"
          />
        </form>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon="📄"
          title="Nenhum documento encontrado"
          description="Crie o primeiro documento ou ajuste os filtros."
          action={<DocumentFormButton clients={allClients} />}
        />
      ) : (
        <Table
          minWidth="700px"
          head={
            <>
              <Th>Documento</Th>
              <Th>Tipo</Th>
              <Th>Cliente</Th>
              <Th>Atualizado</Th>
              <Th className="text-right">Ações</Th>
            </>
          }
        >
          {rows.map((d) => (
            <tr key={d.id} className="hover:bg-zinc-900/60">
              <Td>
                <Link href={`/documentos/${d.id}`} className="font-medium text-zinc-100 hover:text-emerald-300">
                  {d.title}
                </Link>
                {d.createdBy && <p className="text-xs text-zinc-500">por {d.createdBy.name}</p>}
              </Td>
              <Td><Badge tone="blue">{DOC_TYPE_LABELS[d.type]}</Badge></Td>
              <Td className="text-zinc-400">
                {d.client ? (
                  <Link href={`/clientes/${d.client.id}`} className="hover:text-emerald-300">{d.client.name}</Link>
                ) : "—"}
              </Td>
              <Td className="text-zinc-400">{formatDate(d.updatedAt)}</Td>
              <Td className="text-right">
                <ArchiveDocumentButton documentId={d.id} isArchived={d.isArchived} />
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
