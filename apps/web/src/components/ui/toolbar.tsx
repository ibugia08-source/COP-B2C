"use client";

import Link from "next/link";
import type { ReactNode } from "react";
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
