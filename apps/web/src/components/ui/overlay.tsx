"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Button } from "./primitives";

// ---------------------------------------------------------------------------
// Modal / Drawer
// ---------------------------------------------------------------------------

export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/40 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`max-h-[92vh] w-full ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"} overflow-y-auto rounded-t-2xl border border-zinc-700 bg-zinc-900 shadow-2xl sm:rounded-xl`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-5 py-3">
          <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="-mr-1 rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
          >
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ConfirmDialog
// ---------------------------------------------------------------------------

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirmar",
  danger = false,
  pending = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  danger?: boolean;
  pending?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      {description && <p className="text-sm text-zinc-400">{description}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={pending}>
          Cancelar
        </Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={pending}>
          {pending ? "Aguarde..." : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Tabs (client, com estado)
// ---------------------------------------------------------------------------

export function Tabs({
  tabs,
  initial,
}: {
  tabs: { key: string; label: string; content: ReactNode; badge?: number }[];
  initial?: string;
}) {
  const [active, setActive] = useState(initial ?? tabs[0]?.key);
  const current = tabs.find((t) => t.key === active) ?? tabs[0];
  return (
    <div>
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-zinc-800">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActive(tab.key)}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm transition ${
              tab.key === current?.key
                ? "border-emerald-600 font-semibold text-zinc-100"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {tab.label}
            {tab.badge != null && tab.badge > 0 && (
              <span className="ml-1.5 rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>
      <div>{current?.content}</div>
    </div>
  );
}
