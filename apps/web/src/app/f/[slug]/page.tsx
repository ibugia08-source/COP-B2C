import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { formTemplates } from "@/db/schema";
import type { FieldDef } from "@/app/(app)/formularios/field-types";
import { PublicForm } from "./ui";

export const metadata: Metadata = { title: "Formulário — COP B2C" };

// Página PÚBLICA (fora do grupo (app), portanto sem exigir login).
export default async function PublicFormPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const template = await db.query.formTemplates.findFirst({ where: eq(formTemplates.slug, slug) });
  const available = !!template && template.isActive;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-4 py-10">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl">
        {available ? (
          <PublicForm
            slug={slug}
            name={template.name}
            description={template.description}
            fields={template.fields as unknown as FieldDef[]}
          />
        ) : (
          <div className="space-y-2 text-center">
            <div className="text-4xl">🔍</div>
            <h1 className="text-lg font-semibold text-zinc-100">Formulário indisponível</h1>
            <p className="text-sm text-zinc-400">Este formulário não existe ou não está mais ativo.</p>
          </div>
        )}
      </div>
      <p className="mt-4 text-center text-[11px] text-zinc-600">Powered by COP B2C</p>
    </main>
  );
}
