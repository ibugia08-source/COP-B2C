"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "./primitives";
import { Icon } from "@/components/ui/icon";

// ---------------------------------------------------------------------------
// Modal / Drawer
// ---------------------------------------------------------------------------

// "estamos no cliente?" sem setState em effect (padrão useSyncExternalStore)
const subscribeNoop = () => () => {};
const isClient = () => true;
const isServer = () => false;

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

  // Portal para o <body>: o modal não pode ser afetado por overflow/display do
  // contêiner onde o GATILHO mora (ex.: item dentro do OverflowMenu, cards de
  // coluna com overflow). SSR não tem document — só monta no cliente.
  const mounted = useSyncExternalStore(subscribeNoop, isClient, isServer);

  if (!open || !mounted) return null;
  return createPortal(
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
            <Icon name="close" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body,
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
  warning,
  confirmLabel = "Confirmar",
  danger = false,
  pending = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  /** aviso destacado para ações de alto risco (segredos, exclusões, permissões admin) */
  warning?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  pending?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      {description && <p className="text-sm text-zinc-400">{description}</p>}
      {warning && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          <span className="mt-0.5 shrink-0">
            <Icon name="warning" />
          </span>
          <span>{warning}</span>
        </div>
      )}
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

// ---------------------------------------------------------------------------
// UrlTabs — abas com estado na URL (?tab=), linkáveis e resistentes a refresh
// ---------------------------------------------------------------------------

export function UrlTabs({
  tabs,
  param = "tab",
}: {
  tabs: { key: string; label: string; content: ReactNode; badge?: number }[];
  param?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const first = tabs[0]?.key;
  const active = params.get(param) ?? first;
  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  function select(key: string) {
    const next = new URLSearchParams(params.toString());
    if (key === first) next.delete(param);
    else next.set(param, key);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div>
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-zinc-800">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => select(tab.key)}
            aria-current={tab.key === current?.key ? "page" : undefined}
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
