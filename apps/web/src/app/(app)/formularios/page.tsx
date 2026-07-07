import Link from "next/link";
import { asc, desc } from "drizzle-orm";
import { db } from "@/db";
import { clients, formSubmissions, formTemplates } from "@/db/schema";
import { requireSession } from "@/lib/auth/guard";
import { formatDate } from "@/lib/labels";
import { Badge, Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { FillFormButton } from "./ui";

export default async function FormulariosPage() {
  await requireSession();

  const [templates, submissions, allClients] = await Promise.all([
    db.query.formTemplates.findMany({ orderBy: [asc(formTemplates.name)] }),
    db.query.formSubmissions.findMany({
      orderBy: [desc(formSubmissions.createdAt)],
      with: { template: true, client: true },
      limit: 30,
    }),
    db.select({ id: clients.id, name: clients.name }).from(clients).orderBy(asc(clients.name)),
  ]);

  return (
    <div>
      <PageHeader
        title="Formulários"
        description="Formulários internos padronizados — onboarding, briefing, criativos, reunião mensal e problemas."
      />

      {templates.length === 0 ? (
        <EmptyState icon="📝" title="Nenhum formulário configurado" description="Rode o seed para criar os formulários padrão." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((t) => (
            <Card key={t.id} className="flex flex-col p-5">
              <div className="mb-1 flex items-center justify-between">
                <h3 className="font-semibold">{t.name}</h3>
                {!t.isActive && <Badge tone="zinc">inativo</Badge>}
              </div>
              <p className="mb-3 flex-1 text-sm text-zinc-400">{t.description ?? `${(t.fields as unknown[]).length} campos`}</p>
              {t.isActive && <div><FillFormButton template={t} clients={allClients} /></div>}
            </Card>
          ))}
        </div>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-zinc-300">Envios recentes</h2>
        {submissions.length === 0 ? (
          <EmptyState icon="📨" title="Nenhum envio ainda" description="Os formulários enviados aparecem aqui e no histórico do cliente." />
        ) : (
          <Table
            minWidth="700px"
            head={
              <>
                <Th>Formulário</Th>
                <Th>Cliente</Th>
                <Th>Resumo</Th>
                <Th>Quando</Th>
              </>
            }
          >
            {submissions.map((s) => (
              <tr key={s.id} className="hover:bg-zinc-900/60">
                <Td className="font-medium text-zinc-200">{s.template.name}</Td>
                <Td className="text-zinc-400">
                  {s.client ? (
                    <Link href={`/clientes/${s.client.id}`} className="hover:text-emerald-300">{s.client.name}</Link>
                  ) : "—"}
                </Td>
                <Td className="max-w-md truncate text-xs text-zinc-500">
                  {Object.entries(s.data as Record<string, unknown>)
                    .slice(0, 3)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(" · ")}
                </Td>
                <Td className="text-zinc-400">{formatDate(s.createdAt)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </section>
    </div>
  );
}
