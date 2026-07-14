import Link from "next/link";
import { headers } from "next/headers";
import { asc, count, desc } from "drizzle-orm";
import { db } from "@/db";
import { clients, formSubmissions, formTemplates } from "@/db/schema";
import { isAdmin, requireSession } from "@/lib/auth/guard";
import { formatDate } from "@/lib/labels";
import { Badge, Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { CardAdminActions, FillFormButton, TemplateBuilderButton } from "./ui";

export default async function FormulariosPage() {
  const session = await requireSession();
  const admin = isAdmin(session);

  const [templates, submissions, allClients, counts] = await Promise.all([
    db.query.formTemplates.findMany({ orderBy: [asc(formTemplates.name)] }),
    db.query.formSubmissions.findMany({
      orderBy: [desc(formSubmissions.createdAt)],
      with: { template: true, client: true },
      limit: 30,
    }),
    db.select({ id: clients.id, name: clients.name }).from(clients).orderBy(asc(clients.name)),
    db.select({ templateId: formSubmissions.templateId, n: count() }).from(formSubmissions).groupBy(formSubmissions.templateId),
  ]);
  const countByTemplate = new Map(counts.map((c) => [c.templateId, c.n]));

  // URL absoluta para o link público de preenchimento
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${proto}://${host}` : "";
  const publicUrl = (slug: string) => `${origin}/f/${slug}`;

  return (
    <div>
      <PageHeader
        title="Formulários"
        description="Formulários nativos do sistema — crie, compartilhe um link público e receba as respostas aqui. Substitui o Google Forms."
        actions={admin ? <TemplateBuilderButton /> : undefined}
      />

      {templates.length === 0 ? (
        <EmptyState
          icon="📝"
          title="Nenhum formulário ainda"
          description={admin ? 'Clique em "+ Novo formulário" para criar o primeiro.' : "Nenhum formulário configurado. Peça a um administrador para criar."}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((t) => {
            const n = countByTemplate.get(t.id) ?? 0;
            return (
              <Card key={t.id} className="flex flex-col p-5">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <h3 className="font-semibold">{t.name}</h3>
                  {!t.isActive && <Badge tone="zinc">inativo</Badge>}
                </div>
                <p className="mb-3 flex-1 text-sm text-zinc-400">
                  {t.description ?? `${(t.fields as unknown[]).length} campos`}
                </p>

                <div className="flex flex-wrap items-center gap-2">
                  {t.isActive && <FillFormButton template={t} clients={allClients} />}
                  <Link href={`/formularios/${t.id}`} className="text-xs text-zinc-400 hover:text-emerald-300">
                    Ver respostas ({n})
                  </Link>
                </div>

                {t.isActive && (
                  <a
                    href={publicUrl(t.slug)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 block truncate text-[11px] text-zinc-600 hover:text-zinc-400"
                    title={publicUrl(t.slug)}
                  >
                    {publicUrl(t.slug)}
                  </a>
                )}

                {admin && <CardAdminActions template={t} publicUrl={publicUrl(t.slug)} />}
              </Card>
            );
          })}
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
                <Td className="font-medium text-zinc-200">
                  <Link href={`/formularios/${s.templateId}`} className="hover:text-emerald-300">{s.template.name}</Link>
                </Td>
                <Td className="text-zinc-400">
                  {s.client ? (
                    <Link href={`/clientes/${s.client.id}`} className="hover:text-emerald-300">{s.client.name}</Link>
                  ) : "—"}
                </Td>
                <Td className="max-w-md truncate text-xs text-zinc-500">
                  {Object.entries(s.data as Record<string, unknown>)
                    .filter(([k]) => k !== "__respondent")
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
