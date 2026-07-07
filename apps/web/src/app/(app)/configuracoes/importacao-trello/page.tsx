import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { importLogs } from "@/db/schema";
import { hasPermission, requirePermission } from "@/lib/auth/guard";
import { formatDate } from "@/lib/labels";
import { PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { TrelloImportWizard } from "./ui";

export default async function ImportacaoTrelloPage() {
  const session = await requirePermission("settings.view");
  const canConfirm = hasPermission(session, "settings.update");

  const history = await db.query.importLogs.findMany({
    where: eq(importLogs.source, "TRELLO"),
    orderBy: [desc(importLogs.createdAt)],
    limit: 20,
  });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Importação do Trello"
        description="Importe o quadro BANCO DE DADOS DE CONTAS E PERFIS: listas viram grupos, cartões viram ativos, etiquetas viram status e credenciais das descrições são criptografadas."
      />

      <TrelloImportWizard canConfirm={canConfirm} />

      {history.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-zinc-300">Importações anteriores</h2>
          <Table
            minWidth="600px"
            head={<><Th>Arquivo</Th><Th>Cartões</Th><Th>Importados</Th><Th>Pulados</Th><Th>Quando</Th></>}
          >
            {history.map((h) => (
              <tr key={h.id} className="hover:bg-zinc-900/60">
                <Td className="text-zinc-200">{h.fileName ?? "—"}</Td>
                <Td>{h.totalRows}</Td>
                <Td className="text-emerald-400">{h.importedRows}</Td>
                <Td className="text-zinc-400">{h.skippedRows}</Td>
                <Td className="text-zinc-400">{formatDate(h.createdAt)}</Td>
              </tr>
            ))}
          </Table>
        </section>
      )}
    </div>
  );
}
