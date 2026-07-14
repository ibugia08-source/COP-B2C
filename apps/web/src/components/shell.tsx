"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type NavItem = { href: string; label: string; icon: string };
export type NavGroup = { label: string; items: NavItem[] };

// ---------------------------------------------------------------------------
// Navegação mobile (bottom navigation + folha "Mais") — só aparece em < lg
// ---------------------------------------------------------------------------

export function MobileBottomNav({
  primary,
  more,
  userName,
  roles,
  logoutAction,
}: {
  primary: NavItem[];
  more: NavItem[];
  userName: string;
  roles: string;
  logoutAction: () => void;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const moreActive = more.some((i) => isActive(i.href));

  const itemCls = (active: boolean) =>
    `flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-medium transition ${
      active ? "text-emerald-700" : "text-zinc-500"
    }`;

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-zinc-800 bg-zinc-950/95 pb-safe backdrop-blur lg:hidden"
        aria-label="Navegação principal"
      >
        {primary.map((item) => {
          const active = isActive(item.href);
          return (
            <Link key={item.href} href={item.href} className={itemCls(active)} aria-current={active ? "page" : undefined}>
              <span className="text-lg leading-none">{item.icon}</span>
              <span className="max-w-full truncate px-1">{item.label}</span>
            </Link>
          );
        })}
        {more.length > 0 && (
          <button type="button" onClick={() => setOpen(true)} className={itemCls(moreActive)} aria-label="Mais módulos">
            <span className="text-lg leading-none">☰</span>
            <span>Mais</span>
          </button>
        )}
      </nav>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end bg-zinc-950/40 backdrop-blur-sm lg:hidden" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl border border-zinc-700 bg-zinc-900 pb-safe shadow-2xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-5 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-100">{userName}</p>
                <p className="truncate text-[11px] text-zinc-500">{roles}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-900">
                ✕
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 p-4">
              {more.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center text-xs transition ${
                      active ? "border-emerald-600 bg-emerald-50 text-emerald-700" : "border-zinc-800 bg-zinc-950 text-zinc-500 hover:border-zinc-700 hover:text-zinc-900"
                    }`}
                  >
                    <span className="text-2xl leading-none">{item.icon}</span>
                    <span className="leading-tight">{item.label}</span>
                  </Link>
                );
              })}
            </div>
            <div className="border-t border-zinc-800 p-4">
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="w-full rounded-lg border border-zinc-700 py-2.5 text-sm font-medium text-zinc-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                >
                  Sair
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Sidebar nav (client — destaca rota ativa), organizada em grupos
// ---------------------------------------------------------------------------

export function AppNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 max-lg:hidden">
            {group.label}
          </p>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const active =
                item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition max-lg:justify-center max-lg:px-0 ${
                    active
                      ? "bg-emerald-50 font-semibold text-emerald-700"
                      : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-900"
                  }`}
                >
                  <span className="w-4 shrink-0 text-center text-sm">{item.icon}</span>
                  <span className="max-lg:hidden">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Breadcrumbs
// ---------------------------------------------------------------------------

const SEGMENT_LABELS: Record<string, string> = {
  clientes: "Clientes",
  operacao: "Operação",
  tarefas: "Tarefas",
  equipe: "Equipe",
  metas: "Metas",
  ativos: "Banco de Ativos Digitais",
  documentos: "Documentos",
  formularios: "Formulários",
  automacoes: "Automações",
  configuracoes: "Configurações",
  busca: "Busca",
  novo: "Novo",
  editar: "Editar",
  "acesso-negado": "Acesso negado",
};

export function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return <span className="text-sm text-zinc-500">Dashboard</span>;
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-sm text-zinc-500">
      <Link href="/" className="shrink-0 hover:text-zinc-300">
        Início
      </Link>
      {segments.map((seg, i) => {
        const href = "/" + segments.slice(0, i + 1).join("/");
        const label = SEGMENT_LABELS[seg] ?? decodeURIComponent(seg);
        const last = i === segments.length - 1;
        return (
          <span key={href} className="flex min-w-0 items-center gap-1.5">
            <span className="shrink-0">/</span>
            {last ? (
              <span className="truncate text-zinc-300">{label}</span>
            ) : (
              <Link href={href} className="shrink-0 hover:text-zinc-300">
                {label}
              </Link>
            )}
          </span>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Busca global (topbar)
// ---------------------------------------------------------------------------

export function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      className="relative max-md:hidden"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) router.push(`/busca?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-zinc-500">
        🔍
      </span>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar clientes, tarefas, docs..."
        className="w-56 rounded-lg border border-zinc-800 bg-zinc-950 py-1.5 pl-8 pr-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:w-72 focus:border-emerald-500 xl:w-64"
      />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Menu "+ Novo" (topbar)
// ---------------------------------------------------------------------------

export function CreateMenu({
  options,
}: {
  options: { label: string; href: string }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (options.length === 0) return null;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700"
      >
        + Novo
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1.5 w-52 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 py-1 shadow-[0_8px_24px_rgba(16,24,40,0.10)]">
          {options.map((opt) => (
            <Link
              key={opt.href}
              href={opt.href}
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-800 hover:text-zinc-900"
            >
              {opt.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
