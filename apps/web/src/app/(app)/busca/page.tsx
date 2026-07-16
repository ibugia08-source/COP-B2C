import Link from "next/link";
import { and, like, or } from "drizzle-orm";
import { db } from "@/db";
import { clients, documents, tasks } from "@/db/schema";
import { hasPermission, requireSession } from "@/lib/auth/guard";
import { clientScopeCondition, documentScopeCondition, taskScopeCondition } from "@/lib/auth/ownership";
import { CLIENT_STATUS_META, TASK_STATUS_META } from "@/lib/labels";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";

type Search = Record<string, string | string[] | undefined>;

export default async function BuscaPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requireSession();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";

  const canClients = hasPermission(session, "clients.view");
  const canTasks = hasPermission(session, "tasks.view");
  const canDocs = hasPermission(session, "documents.view");
  const canAny = canClients || canTasks || canDocs;

  // Campo de busca na própria página (a busca da topbar some no mobile).
  const searchForm = (
    <form action="/busca" method="get" className="mb-6">
      <label className="relative block">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
          <Icon name="search" />
        </span>
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar clientes, tarefas, documentos..."
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 py-2.5 pl-10 pr-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-600"
        />
      </label>
    </form>
  );

  if (!q) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Busca" />
        {searchForm}
        <EmptyState
          icon="search"
          title="O que você procura?"
          description="Digite acima e pressione Enter para buscar clientes, tarefas e documentos."
        />
      </div>
    );
  }

  const pattern = `%${q}%`;
  // respeita o escopo: clientes/tarefas são abertos; documentos por cliente
  const clientScope = clientScopeCondition(session);
  const taskScope = taskScopeCondition(session);
  const docScope = documentScopeCondition(session);
  const [foundClients, foundTasks, foundDocs] = await Promise.all([
    canClients
      ? db.query.clients.findMany({
          where: and(clientScope, or(like(clients.name, pattern), like(clients.brandName, pattern), like(clients.niche, pattern))),
          limit: 10,
        })
      : Promise.resolve([]),
    canTasks
      ? db.query.tasks.findMany({
          where: and(taskScope, or(like(tasks.title, pattern), like(tasks.description, pattern))),
          limit: 10,
        })
      : Promise.resolve([]),
    canDocs
      ? db.query.documents.findMany({
          where: and(docScope, or(like(documents.title, pattern), like(documents.content, pattern))),
          limit: 10,
        })
      : Promise.resolve([]),
  ]);

  const total = foundClients.length + foundTasks.length + foundDocs.length;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={`Busca: "${q}"`} description={`${total} resultado${total === 1 ? "" : "s"}`} />
      {searchForm}

      {!canAny ? (
        <EmptyState
          icon="lock"
          title="Sem acesso a itens buscáveis"
          description="Seu papel não permite ver clientes, tarefas nem documentos."
        />
      ) : total === 0 ? (
        <EmptyState icon="search" title="Nada encontrado" description={`Nenhum cliente, tarefa ou documento corresponde a "${q}".`} />
      ) : (
        <div className="space-y-6">
          {foundClients.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase text-zinc-500">
                Clientes{foundClients.length === 10 ? " (primeiros 10)" : ""}
              </h2>
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
              <h2 className="mb-2 text-xs font-semibold uppercase text-zinc-500">
                Tarefas{foundTasks.length === 10 ? " (primeiras 10)" : ""}
              </h2>
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
              <h2 className="mb-2 text-xs font-semibold uppercase text-zinc-500">
                Documentos{foundDocs.length === 10 ? " (primeiros 10)" : ""}
              </h2>
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
