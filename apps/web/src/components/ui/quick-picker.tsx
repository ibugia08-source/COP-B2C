"use client";

import { useEffect, useRef, useState } from "react";
import { UserAvatar } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";

export type PickerOption = { value: string; label: string; avatar?: string | null };

/**
 * Seletor das linhas do card: busca por digitação + clique na lista, com foto
 * quando existir.
 *
 * O painel é `position: fixed` ancorado no gatilho — assim NÃO é cortado pelo
 * overflow da coluna nem do quadro (§19), sem precisar de portal.
 */
export function QuickPicker({
  value,
  onChange,
  options,
  placeholder,
  searchable = false,
  emptyText = "Nenhum resultado",
}: {
  value: string;
  onChange: (v: string) => void;
  options: PickerOption[];
  placeholder: string;
  searchable?: boolean;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const selected = options.find((o) => o.value === value) ?? null;
  const filtered = q.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase()))
    : options;

  useEffect(() => {
    if (!open) return;
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 220) });
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function close() {
    setOpen(false);
    setQ("");
  }

  function pick(v: string) {
    onChange(v);
    close();
  }

  // Esc fecha SÓ o seletor — stopPropagation impede que o Esc chegue ao card
  // de criação (que interpretaria como "descartar o card").
  function onEscape(e: React.KeyboardEvent) {
    if (e.key === "Escape" && open) {
      e.stopPropagation();
      e.preventDefault();
      close();
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onEscape}
        className="flex w-full items-center gap-1.5 text-left text-[11px]"
      >
        {selected ? (
          <>
            {selected.avatar !== undefined && (
              <UserAvatar name={selected.label} size="sm" src={selected.avatar} />
            )}
            <span className="truncate text-zinc-200">{selected.label}</span>
          </>
        ) : (
          <span className="text-zinc-500">{placeholder}</span>
        )}
      </button>

      {open && pos && (
        <div
          ref={panelRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 60 }}
          className="max-h-64 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 p-1 shadow-xl"
          onKeyDown={onEscape}
        >
          <div className="mb-1 flex items-center gap-1">
            {searchable ? (
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar..."
                className="min-w-0 flex-1 rounded-md bg-zinc-800 px-2 py-1.5 text-[11px] text-zinc-200 outline-none placeholder:text-zinc-500"
              />
            ) : (
              <span className="min-w-0 flex-1 truncate px-2 text-[11px] text-zinc-500">{placeholder}</span>
            )}
            <button
              type="button"
              onClick={close}
              aria-label="Fechar"
              title="Fechar (Esc)"
              className="shrink-0 rounded-md p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-100"
            >
              <Icon name="close" />
            </button>
          </div>
          {value && (
            <button
              type="button"
              onClick={() => pick("")}
              className="block w-full rounded-md px-2 py-1.5 text-left text-[11px] text-zinc-500 hover:bg-zinc-800"
            >
              Limpar seleção
            </button>
          )}
          {filtered.length === 0 ? (
            <p className="px-2 py-2 text-[11px] text-zinc-500">{emptyText}</p>
          ) : (
            filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => pick(o.value)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] text-zinc-200 hover:bg-zinc-800"
              >
                {o.avatar !== undefined && <UserAvatar name={o.label} size="sm" src={o.avatar} />}
                <span className="truncate">{o.label}</span>
              </button>
            ))
          )}
        </div>
      )}
    </>
  );
}
