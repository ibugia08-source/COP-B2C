import { desc } from "drizzle-orm";
import { db } from "@/db";
import { importLogs } from "@/db/schema";
import { hasPermission, requirePermission } from "@/lib/auth/guard";
import { formatDate } from "@/lib/labels";
import { PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { ImportWizard } from "./ui";

export default async function ImportacaoPage() {
  const session = await requirePermission("settings.view");
  const canConfirm = hasPermission(session, "settings.update");

  const history = await db.query.importLogs.findMany({
    orderBy: [desc(importLogs.createdAt)],
    limit: 20,
  });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Importação do ClickUp"
        description="Importe clientes do CSV exportado da lista TRÁFEGO PAGO — com prévia, validação e relatório. Linhas que são tarefas não viram clientes."
      />

      <ImportWizard canConfirm={canConfirm} />

      {history.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-zinc-300">Importações anteriores</h2>
          <Table
            minWidth="600px"
            head={
              <>
                <Th>Arquivo</Th>
                <Th>Total</Th>
                <Th>Importados</Th>
                <Th>Ignorados</Th>
                <Th>Erros</Th>
                <Th>Quando</Th>
              </>
            }
          >
            {history.map((h) => (
              <tr key={h.id} className="hover:bg-zinc-900/60">
                <Td className="text-zinc-200">{h.fileName ?? "—"}</Td>
                <Td>{h.totalRows}</Td>
                <Td className="text-emerald-400">{h.importedRows}</Td>
                <Td className="text-zinc-400">{h.skippedRows}</Td>
                <Td className={h.errorRows ? "text-red-400" : "text-zinc-400"}>{h.errorRows}</Td>
                <Td className="text-zinc-400">{formatDate(h.createdAt)}</Td>
              </tr>
            ))}
          </Table>
        </section>
      )}
    </div>
  );
}
