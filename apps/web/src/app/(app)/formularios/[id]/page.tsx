import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { formSubmissions, formTemplates } from "@/db/schema";
import { requirePermission } from "@/lib/auth/guard";
import { formatDate } from "@/lib/labels";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import type { FieldDef } from "../field-types";

export default async function FormResponsesPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("forms.view_submissions");
  const { id } = await params;

  const template = await db.query.formTemplates.findFirst({ where: eq(formTemplates.id, id) });
  if (!template) notFound();

  const submissions = await db.query.formSubmissions.findMany({
    where: eq(formSubmissions.templateId, id),
    orderBy: [desc(formSubmissions.createdAt)],
    with: { client: true, submittedBy: true },
  });

  const fields = template.fields as unknown as FieldDef[];
  const labelByName = new Map(fields.map((f) => [f.name, f.label]));

  return (
    <div>
      <PageHeader
        title={`Respostas — ${template.name}`}
        description={`${submissions.length} resposta(s) recebida(s).`}
        actions={
          <Link href="/formularios" className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white">
            ← Voltar
          </Link>
        }
      />

      {submissions.length === 0 ? (
        <EmptyState icon="envelope" title="Nenhuma resposta ainda" description="As respostas deste formulário aparecerão aqui." />
      ) : (
        <div className="space-y-4">
          {submissions.map((s) => {
            const data = s.data as Record<string, unknown>;
            const respondent = data.__respondent as { name?: string | null; email?: string | null } | undefined;
            const origem = s.submittedBy?.name
              ? `Interno — ${s.submittedBy.name}`
              : respondent?.name || respondent?.email
                ? `Público — ${respondent?.name ?? ""}${respondent?.email ? ` <${respondent.email}>` : ""}`.trim()
                : "Público";
            return (
              <Card key={s.id} className="p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-2 text-xs text-zinc-500">
                  <span>{formatDate(s.createdAt)}</span>
                  <span className="flex items-center gap-3">
                    <span>{origem}</span>
                    {s.client && (
                      <Link href={`/clientes/${s.client.id}`} className="text-emerald-400 hover:text-emerald-300">
                        {s.client.name}
                      </Link>
                    )}
                  </span>
                </div>
                <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                  {fields.map((f) => (
                    <div key={f.name}>
                      <dt className="text-[11px] uppercase text-zinc-500">{labelByName.get(f.name) ?? f.name}</dt>
                      <dd className="text-sm text-zinc-200">{String(data[f.name] ?? "") || "—"}</dd>
                    </div>
                  ))}
                </dl>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
