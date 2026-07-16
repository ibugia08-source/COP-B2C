"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/overlay";

// ---------------------------------------------------------------------------
// MoveMenu — "Mover para…" para cards de Kanban. Abre um modal (centralizado,
// nunca cortado por overflow e ótimo no toque) com a lista de destinos.
// Alternativa ao arrastar, que não funciona no toque nem no teclado.
// ---------------------------------------------------------------------------

export type MoveOption = { value: string; label: string };

export function MoveMenu({
  options,
  currentValue,
  onMove,
  disabled = false,
  title = "Mover para…",
  triggerLabel,
}: {
  options: MoveOption[];
  currentValue?: string;
  onMove: (value: string) => void;
  disabled?: boolean;
  title?: string;
  /** rótulo opcional ao lado do ícone (ex.: em telas maiores) */
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        title={title}
        aria-label={title}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className="inline-flex items-center gap-1 rounded-md p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-40"
      >
        <Icon name="move" />
        {triggerLabel && <span className="text-xs">{triggerLabel}</span>}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={title}>
        <div className="flex flex-col gap-1.5">
          {options.map((o) => {
            const current = o.value === currentValue;
            return (
              <button
                key={o.value}
                type="button"
                disabled={current}
                onClick={() => {
                  setOpen(false);
                  if (!current) onMove(o.value);
                }}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${
                  current
                    ? "border-emerald-700 bg-emerald-950/40 text-emerald-300"
                    : "border-zinc-800 bg-zinc-900 text-zinc-200 hover:border-zinc-600 hover:bg-zinc-800"
                }`}
              >
                {o.label}
                {current && <span className="text-[11px] font-medium text-emerald-400">atual</span>}
              </button>
            );
          })}
        </div>
      </Modal>
    </>
  );
}
