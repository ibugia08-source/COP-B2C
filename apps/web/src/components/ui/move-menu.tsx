"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";

// ---------------------------------------------------------------------------
// MoveMenu — menu "Mover para…" para cards de Kanban. Alternativa ao arrastar
// (que não funciona no toque nem no teclado). Usado em Operação, Ativos, Tarefas.
// ---------------------------------------------------------------------------

export type MoveOption = { value: string; label: string };

export function MoveMenu({
  options,
  currentValue,
  onMove,
  disabled = false,
  title = "Mover para…",
  align = "right",
}: {
  options: MoveOption[];
  currentValue?: string;
  onMove: (value: string) => void;
  disabled?: boolean;
  title?: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        title={title}
        aria-label={title}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="rounded-md p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-40"
      >
        <Icon name="move" />
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute top-full z-30 mt-1 max-h-72 w-52 overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 py-1 shadow-[0_8px_24px_rgba(16,24,40,0.12)] ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Mover para</p>
          {options.map((o) => {
            const isCurrent = o.value === currentValue;
            return (
              <button
                key={o.value}
                type="button"
                role="menuitem"
                disabled={isCurrent}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpen(false);
                  if (!isCurrent) onMove(o.value);
                }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition ${
                  isCurrent ? "text-zinc-500" : "text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                }`}
              >
                {isCurrent ? <Icon name="check" className="text-[11px]" /> : <span className="w-[11px]" />}
                <span>{o.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
