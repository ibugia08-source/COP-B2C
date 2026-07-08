import Link from "next/link";
import { and, desc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { requireSession } from "@/lib/auth/guard";
import { formatDate } from "@/lib/labels";
import { Badge, Button, EmptyState, PageHeader } from "@/components/ui/primitives";

const TYPE_TONES: Record<string, "blue" | "amber" | "red" | "green" | "zinc"> = {
  INFO: "blue",
  ALERTA: "amber",
  COBRANCA: "red",
  TAREFA: "green",
  SISTEMA: "zinc",
};

async function markAllRead() {
  "use server";
  const { getSession } = await import("@/lib/auth/session");
  const session = await getSession();
  if (!session) return;
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, session.userId), isNull(notifications.readAt)));
  revalidatePath("/notificacoes");
  revalidatePath("/");
}

async function markRead(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const { getSession } = await import("@/lib/auth/session");
  const session = await getSession();
  if (!session) return;
  // só marca notificações do próprio usuário (sem vazamento entre contas)
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, session.userId)));
  revalidatePath("/notificacoes");
  revalidatePath("/");
}

const ENTITY_LINK: Record<string, string> = {
  goal: "/metas",
  task: "/tarefas",
  digitalAsset: "/ativos",
  client: "/clientes",
};

export default async function NotificacoesPage() {
  const session = await requireSession();

  const rows = await db.query.notifications.findMany({
    where: eq(notifications.userId, session.userId),
    orderBy: [desc(notifications.createdAt)],
    limit: 100,
  });
  const unread = rows.filter((n) => !n.readAt).length;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Notificações"
        description={unread ? `${unread} não lida${unread > 1 ? "s" : ""}` : "Tudo lido. 🎉"}
        actions={
          unread > 0 && (
            <form action={markAllRead}>
              <Button variant="secondary" size="sm" type="submit">Marcar todas como lidas</Button>
            </form>
          )
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon="🔔"
          title="Nenhuma notificação"
          description="Alertas de tarefas, cobranças e automações aparecem aqui."
        />
      ) : (
        <div className="space-y-2">
          {rows.map((n) => {
            const link = n.entityType ? ENTITY_LINK[n.entityType] : undefined;
            return (
              <div
                key={n.id}
                className={`rounded-lg border px-4 py-3 ${
                  n.readAt ? "border-zinc-800 bg-zinc-900/40 opacity-70" : "border-zinc-700 bg-zinc-900"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-zinc-100">
                    {!n.readAt && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-emerald-500" />}
                    {n.title}
                  </p>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-zinc-500">
                    <Badge tone={TYPE_TONES[n.type] ?? "zinc"}>{n.type}</Badge>
                    {formatDate(n.createdAt)}
                  </span>
                </div>
                {n.body && <p className="mt-1 text-sm text-zinc-400">{n.body}</p>}
                <div className="mt-2 flex items-center gap-3">
                  {link && (
                    <Link href={link} className="text-xs text-emerald-400 hover:underline">
                      abrir →
                    </Link>
                  )}
                  {!n.readAt && (
                    <form action={markRead}>
                      <input type="hidden" name="id" value={n.id} />
                      <button type="submit" className="text-xs text-zinc-500 hover:text-white">
                        marcar como lida
                      </button>
                    </form>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
