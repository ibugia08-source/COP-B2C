"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/icon";

// ---------------------------------------------------------------------------
// Toolbar de tela de lista + Segmented (alternador de visão)
// Padroniza a faixa de controles: alternador à esquerda, ações à direita.
// ---------------------------------------------------------------------------

export type SegmentedItem = {
  value: string;
  label: string;
  icon?: IconName;
  /** se informado, o segmento vira um link (visão via URL) em vez de botão */
  href?: string;
};

export function Segmented({
  items,
  active,
  onChange,
  size = "md",
  ariaLabel,
}: {
  items: SegmentedItem[];
  active: string;
  onChange?: (value: string) => void;
  size?: "sm" | "md";
  ariaLabel?: string;
}) {
  const pad = size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm";
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-0.5 rounded-lg border border-zinc-800 bg-zinc-900 p-0.5"
    >
      {items.map((item) => {
        const on = item.value === active;
        const cls = `inline-flex items-center gap-1.5 rounded-md font-medium transition ${pad} ${
          on ? "bg-emerald-600 text-white shadow-sm" : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
        }`;
        const inner = (
          <>
            {item.icon && <Icon name={item.icon} />}
            {item.label}
          </>
        );
        return item.href ? (
          <Link key={item.value} href={item.href} aria-current={on ? "page" : undefined} className={cls}>
            {inner}
          </Link>
        ) : (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange?.(item.value)}
            className={cls}
          >
            {inner}
          </button>
        );
      })}
    </div>
  );
}

/** Faixa de controles: itens à esquerda; use <ToolbarRight> para empurrar o resto à direita. */
export function Toolbar({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mb-4 flex flex-wrap items-center gap-2 ${className}`}>{children}</div>;
}

export function ToolbarRight({ children }: { children: ReactNode }) {
  return <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>;
}

/** Botão "Filtros (n)" com contagem de filtros ativos, para abrir/fechar a FilterBar. */
export function FilterToggle({
  open,
  count,
  onClick,
}: {
  open: boolean;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
        count > 0 || open
          ? "border-emerald-600 bg-emerald-950/40 text-emerald-300"
          : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
      }`}
    >
      <Icon name="search" /> Filtros
      {count > 0 && (
        <span className="rounded-full bg-emerald-600 px-1.5 text-[10px] font-bold text-white nums">{count}</span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Menu "⋯" para ações secundárias da toolbar
// ---------------------------------------------------------------------------

/**
 * Agrupa ações de uso raro (Config., Templates, formulário completo…) num
 * dropdown, tirando-as da disputa por atenção na barra principal.
 *
 * O painel usa position:fixed ancorado no gatilho (mesmo padrão do
 * QuickPicker), então não é cortado por overflow de contêineres.
 * Os itens são ReactNode: links, botões e componentes com modal próprio
 * (ex.: TaskCreateButton) continuam funcionando montados aqui dentro.
 */
export function OverflowMenu({ label = "Mais ações", children }: { label?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        title={label}
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center rounded-lg border px-2.5 py-1.5 text-sm font-medium transition ${
          open
            ? "border-zinc-500 bg-zinc-800 text-zinc-100"
            : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
        }`}
      >
        ⋯
      </button>
      {/* SEMPRE montado (display:none quando fechado): itens com modal/drawer
          próprio (ex.: ConfigDrawerButton) guardam estado interno — desmontar
          o painel ao fechar o menu mataria o drawer recém-aberto. */}
      <div
        ref={panelRef}
        style={{
          position: "fixed",
          top: pos?.top ?? 0,
          right: pos?.right ?? 0,
          zIndex: 60,
          display: open && pos ? undefined : "none",
        }}
        className="flex min-w-44 flex-col gap-0.5 rounded-lg border border-zinc-700 bg-zinc-900 p-1 shadow-xl"
        // clique num item fecha o menu (modais/drawers dos itens seguem abertos)
        onClick={() => setOpen(false)}
      >
        {children}
      </div>
    </>
  );
}

/** Item do OverflowMenu com aparência padronizada (para links simples). */
export function OverflowItem({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-zinc-300 transition hover:bg-zinc-800 hover:text-zinc-100"
    >
      {children}
    </Link>
  );
}
