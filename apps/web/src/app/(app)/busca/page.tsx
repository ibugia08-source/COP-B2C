import Link from "next/link";
import { like, or } from "drizzle-orm";
import { db } from "@/db";
import { clients, documents, tasks } from "@/db/schema";
import { hasPermission, requireSession } from "@/lib/auth/guard";
import { CLIENT_STATUS_META, TASK_STATUS_META } from "@/lib/labels";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";

type Search = Record<string, string | string[] | undefined>;

export default async function BuscaPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requireSession();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";

  if (!q) {
    return (
      <div>
        <PageHeader title="Busca" />
        <EmptyState icon="search" title="Digite algo na busca do topo" description="Você pode buscar clientes, tarefas e documentos." />
      </div>
    );
  }

  const pattern = `%${q}%`;
  const canClients = hasPermission(session, "clients.view");
  const canTasks = hasPermission(session, "tasks.view");

  const [foundClients, foundTasks, foundDocs] = await Promise.all([
    canClients
      ? db.query.clients.findMany({
          where: or(like(clients.name, pattern), like(clients.brandName, pattern), like(clients.niche, pattern)),
          limit: 10,
        })
      : Promise.resolve([]),
    canTasks
      ? db.query.tasks.findMany({
          where: or(like(tasks.title, pattern), like(tasks.description, pattern)),
          limit: 10,
        })
      : Promise.resolve([]),
    db.query.documents.findMany({
      where: or(like(documents.title, pattern), like(documents.content, pattern)),
      limit: 10,
    }),
  ]);

  const total = foundClients.length + foundTasks.length + foundDocs.length;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={`Busca: "${q}"`} description={`${total} resultado${total === 1 ? "" : "s"}`} />

      {total === 0 ? (
        <EmptyState icon="search" title="Nada encontrado" description="Tente outro termo." />
      ) : (
        <div className="space-y-6">
          {foundClients.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase text-zinc-500">Clientes</h2>
              <div className="space-y-1">
                {foundClients.map((c) => (
                  <Link key={c.id} href={`/clientes/${c.id}`} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 transition hover:border-zinc-600">
                    <span className="text-sm text-zinc-100"><Icon name="clients" /> {c.name}</span>
                    <StatusBadge value={c.status} meta={CLIENT_STATUS_META} />
                  </Link>
                ))}
              </div>
            </section>
          )}
          {foundTasks.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase text-zinc-500">Tarefas</h2>
              <div className="space-y-1">
                {foundTasks.map((t) => (
                  <Link key={t.id} href={`/tarefas/${t.id}`} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 transition hover:border-zinc-600">
                    <span className="text-sm text-zinc-100"><Icon name="tasks" /> {t.title}</span>
                    <StatusBadge value={t.status} meta={TASK_STATUS_META} />
                  </Link>
                ))}
              </div>
            </section>
          )}
          {foundDocs.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase text-zinc-500">Documentos</h2>
              <div className="space-y-1">
                {foundDocs.map((d) => (
                  <Link key={d.id} href={`/documentos/${d.id}`} className="block rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 transition hover:border-zinc-600">
                    <Icon name="documents" /> {d.title}
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
