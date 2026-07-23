import Link from "next/link";
import { and, count, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { notifications, users } from "@/db/schema";
import { avatarSrc } from "@/lib/avatar";
import { logout } from "@/lib/auth/actions";
import { requireSession, sessionPermissions } from "@/lib/auth/guard";
import { CARGO_LABELS, type PermissionKey } from "@/lib/auth/permissions";
import { AppNav, Breadcrumbs, GlobalSearch, MobileBottomNav, type NavGroup, type NavItem } from "@/components/shell";
import { Logo, UserAvatar } from "@/components/ui/primitives";
import { ThemeToggle } from "@/components/theme-toggle";
import { Icon } from "@/components/ui/icon";

type NavDef = NavItem & { permission?: PermissionKey };
type NavGroupDef = { label: string; items: NavDef[] };

const NAV_GROUPS: NavGroupDef[] = [
  {
    label: "Rotina",
    items: [
      { href: "/", label: "Dashboard", icon: "dashboard" },
      { href: "/copiloto", label: "Co-piloto", icon: "copilot", permission: "tasks.view" },
      { href: "/operacao", label: "Clientes & Operação", icon: "operation", permission: "clients.view" },
      { href: "/tarefas", label: "Tarefas", icon: "tasks", permission: "tasks.view" },
    ],
  },
  {
    label: "Gestão",
    items: [
      { href: "/ativos", label: "Banco de Ativos", icon: "assets", permission: "digital_assets.view" },
      { href: "/documentos", label: "Documentos", icon: "documents", permission: "documents.view" },
      { href: "/metas", label: "Metas", icon: "goals", permission: "goals.view" },
      { href: "/formularios", label: "Formulários", icon: "forms", permission: "forms.view" },
    ],
  },
  {
    label: "Administração",
    items: [
      { href: "/equipe", label: "Equipe", icon: "team", permission: "team.view" },
      { href: "/automacoes", label: "Automações", icon: "automations", permission: "automations.view" },
      { href: "/configuracoes", label: "Configurações", icon: "settings", permission: "settings.view" },
    ],
  },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const perms = sessionPermissions(session);
  const cargoLabel = session.cargo ? CARGO_LABELS[session.cargo] : "Sem cargo";
  const navGroups: NavGroup[] = NAV_GROUPS.map((g) => ({
    label: g.label,
    items: g.items
      .filter((i) => !i.permission || perms.has(i.permission))
      .map(({ href, label, icon }) => ({ href, label, icon })),
  })).filter((g) => g.items.length > 0);

  // A foto vem do banco (não do JWT) para não invalidar sessões existentes.
  // Mesma onda da contagem de notificações — sem round-trip extra em série.
  const [[{ n: unread }], me] = await Promise.all([
    db
      .select({ n: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, session.userId), isNull(notifications.readAt))),
    db.query.users.findFirst({
      where: eq(users.id, session.userId),
      columns: { avatarUrl: true },
    }),
  ]);
  const myAvatar = avatarSrc(session.userId, me?.avatarUrl);

  // Navegação mobile: 4 primários na bottom bar + o restante na folha "Mais"
  const flatNav = navGroups.flatMap((g) => g.items);
  const PRIMARY_HREFS = ["/", "/operacao", "/tarefas", "/ativos"];
  const mobilePrimary = PRIMARY_HREFS.map((h) => flatNav.find((i) => i.href === h)).filter(
    (i): i is NavItem => !!i,
  );
  const mobileMore = flatNav.filter((i) => !PRIMARY_HREFS.includes(i.href));

  return (
    <div className="flex min-h-screen bg-zinc-950">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900 lg:flex">
        <div className="flex h-14 items-center border-b border-zinc-800 px-4">
          <Link href="/" className="flex items-center" title="COP B2C" aria-label="COP B2C — início">
            <Logo className="h-[18px]" />
          </Link>
        </div>
        <AppNav groups={navGroups} />
        <div className="border-t border-zinc-800 p-3 max-lg:p-2">
          <div className="mb-2 flex items-center gap-2 max-lg:justify-center">
            <UserAvatar name={session.name} size="sm" src={myAvatar} />
            <div className="min-w-0 max-lg:hidden">
              <p className="truncate text-xs font-medium text-zinc-100">{session.name}</p>
              <p className="truncate text-[10px] text-zinc-500">{cargoLabel}</p>
            </div>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="w-full rounded-lg border border-zinc-700 px-2 py-1.5 text-xs text-zinc-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
            >
              <span className="max-lg:hidden">Sair</span>
              <span className="hidden max-lg:inline"><Icon name="logout" /></span>
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-950/80 px-6 backdrop-blur max-md:px-4">
          <Link href="/" className="flex shrink-0 items-center lg:hidden" title="COP B2C" aria-label="Início">
            <Logo className="h-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <Breadcrumbs />
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <GlobalSearch />
            <ThemeToggle />
            <Link
              href="/notificacoes"
              className="relative rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-100"
              title="Notificações"
              aria-label={unread > 0 ? `Notificações (${unread} não lidas)` : "Notificações"}
            >
              <Icon name="bell" />
              {unread > 0 && (
                <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </Link>
          </div>
        </header>
        <main className="mx-auto min-w-0 w-full max-w-[1400px] flex-1 overflow-x-hidden p-6 pb-[calc(5rem+env(safe-area-inset-bottom))] max-md:p-4 max-md:pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-6">
          {children}
        </main>
      </div>

      <MobileBottomNav
        primary={mobilePrimary}
        more={mobileMore}
        userName={session.name}
        roles={cargoLabel}
        logoutAction={logout}
      />
    </div>
  );
}
