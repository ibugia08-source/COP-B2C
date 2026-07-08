import Link from "next/link";
import { and, count, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { logout } from "@/lib/auth/actions";
import { requireSession, sessionPermissions } from "@/lib/auth/guard";
import type { PermissionKey } from "@/lib/auth/permissions";
import { AppNav, Breadcrumbs, GlobalSearch, type NavItem } from "@/components/shell";
import { UserAvatar } from "@/components/ui/primitives";

type NavDef = NavItem & { permission?: PermissionKey };

const NAV: NavDef[] = [
  { href: "/", label: "Dashboard", icon: "▦" },
  { href: "/copiloto", label: "Co-piloto", icon: "🧭", permission: "tasks.view" },
  { href: "/clientes", label: "Clientes", icon: "👥", permission: "clients.view" },
  { href: "/operacao", label: "Operação", icon: "🔄", permission: "clients.view" },
  { href: "/tarefas", label: "Tarefas", icon: "☑", permission: "tasks.view" },
  { href: "/equipe", label: "Equipe", icon: "🧑‍💼", permission: "team.view" },
  { href: "/metas", label: "Metas", icon: "🎯", permission: "goals.view" },
  { href: "/ativos", label: "Banco de Ativos Digitais", icon: "🗄️", permission: "digital_assets.view" },
  { href: "/documentos", label: "Documentos", icon: "📄" },
  { href: "/formularios", label: "Formulários", icon: "📝" },
  { href: "/automacoes", label: "Automações", icon: "⚡", permission: "automations.view" },
  { href: "/configuracoes", label: "Configurações", icon: "⚙", permission: "settings.view" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const perms = sessionPermissions(session);
  const visibleNav = NAV.filter((i) => !i.permission || perms.has(i.permission)).map(
    ({ href, label, icon }) => ({ href, label, icon }),
  );

  const [{ n: unread }] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, session.userId), isNull(notifications.readAt)));

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900/60 max-lg:w-14">
        <div className="border-b border-zinc-800 p-4 max-lg:p-2 max-lg:text-center">
          <Link href="/" className="text-lg font-bold tracking-tight">
            <span className="max-lg:hidden">
              COP <span className="text-emerald-400">B2C</span>
            </span>
            <span className="hidden text-emerald-400 max-lg:inline">B2C</span>
          </Link>
        </div>
        <AppNav items={visibleNav} />
        <div className="border-t border-zinc-800 p-3 max-lg:p-2">
          <div className="mb-2 flex items-center gap-2 max-lg:justify-center">
            <UserAvatar name={session.name} size="sm" />
            <div className="min-w-0 max-lg:hidden">
              <p className="truncate text-xs font-medium">{session.name}</p>
              <p className="truncate text-[10px] text-zinc-500">{session.roles.join(", ")}</p>
            </div>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="w-full rounded-lg border border-zinc-700 px-2 py-1.5 text-xs text-zinc-300 transition hover:border-red-800 hover:text-red-300"
            >
              <span className="max-lg:hidden">Sair</span>
              <span className="hidden max-lg:inline">⎋</span>
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-zinc-800 bg-zinc-950/90 px-6 py-3 backdrop-blur max-md:px-4">
          <Breadcrumbs />
          <div className="flex shrink-0 items-center gap-3">
            <GlobalSearch />
            <Link
              href="/notificacoes"
              className="relative rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
              title="Notificações"
            >
              🔔
              {unread > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </Link>
          </div>
        </header>
        <main className="min-w-0 flex-1 p-6 max-md:p-4">{children}</main>
      </div>
    </div>
  );
}
