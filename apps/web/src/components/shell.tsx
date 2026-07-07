"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type NavItem = { href: string; label: string; icon: string };

// ---------------------------------------------------------------------------
// Sidebar nav (client — destaca rota ativa)
// ---------------------------------------------------------------------------

export function AppNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
      {items.map((item) => {
        const active =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
              active
                ? "bg-emerald-950/60 font-semibold text-emerald-300"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
            }`}
          >
            <span className="w-4 text-center text-xs">{item.icon}</span>
            <span className="max-lg:hidden">{item.label}</span>
          </Link>
        );
      })}
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
  criativos: "Criativos",
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
  importacao: "Importação",
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
        className="w-64 rounded-lg border border-zinc-800 bg-zinc-900 py-1.5 pl-8 pr-3 text-sm outline-none placeholder:text-zinc-600 focus:border-emerald-600"
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
        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
      >
        + Novo
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-52 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl">
          {options.map((opt) => (
            <Link
              key={opt.href}
              href={opt.href}
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white"
            >
              {opt.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
