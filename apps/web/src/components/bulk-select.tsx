"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { Icon } from "@/components/ui/icon";

// ---------------------------------------------------------------------------
// Seleção múltipla + ações em massa (lixeira por card/linha + barra flutuante)
// Compartilhado por Operação, Tarefas e Banco de Ativos (Kanban e Lista).
// ---------------------------------------------------------------------------

export type BulkResult = { ok: number; fail: number; error?: string; success?: string };

type Ctx = {
  selected: Set<string>;
  has: (id: string) => boolean;
  toggle: (id: string) => void;
  /** marca/desmarca um lote de uma vez (usado pelo "selecionar coluna") */
  setMany: (ids: string[], on: boolean) => void;
  clear: () => void;
  count: number;
};

const SelectionCtx = createContext<Ctx | null>(null);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const setMany = useCallback((ids: string[], on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);
  const clear = useCallback(() => setSelected(new Set()), []);
  const value = useMemo<Ctx>(
    () => ({ selected, has: (id) => selected.has(id), toggle, setMany, clear, count: selected.size }),
    [selected, toggle, setMany, clear],
  );
  return <SelectionCtx.Provider value={value}>{children}</SelectionCtx.Provider>;
}

function useSelection(): Ctx {
  const ctx = useContext(SelectionCtx);
  if (!ctx) throw new Error("useSelection deve ser usado dentro de SelectionProvider");
  return ctx;
}

/** Círculo de seleção (para o canto do card ou primeira coluna da lista). */
export function SelectCircle({ id, className = "" }: { id: string; className?: string }) {
  const { has, toggle } = useSelection();
  const checked = has(id);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={checked ? "Desmarcar" : "Selecionar"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(id);
      }}
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition ${
        checked ? "border-emerald-600 bg-emerald-600 text-white" : "border-zinc-600 bg-zinc-900 text-transparent hover:border-emerald-500"
      } ${className}`}
    >
      <Icon name="check" className="text-[11px]" />
    </button>
  );
}

/**
 * Marca/desmarca TODOS os cards de uma coluna de uma vez.
 *
 * A seleção é global (um único conjunto no provider), então dá para marcar a
 * coluna A, depois a coluna B, e agir sobre as duas juntas na BulkBar.
 */
export function ColumnSelectAll({ ids, className = "" }: { ids: string[]; className?: string }) {
  const { has, setMany } = useSelection();
  if (ids.length === 0) return null;
  const allOn = ids.every((id) => has(id));
  const someOn = !allOn && ids.some((id) => has(id));
  return (
    <button
      type="button"
      onClick={() => setMany(ids, !allOn)}
      title={allOn ? "Desmarcar todas desta coluna" : "Selecionar todas desta coluna"}
      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[9px] transition ${
        allOn
          ? "border-emerald-600 bg-emerald-600 text-white"
          : someOn
            ? "border-emerald-600 bg-emerald-900/60 text-emerald-300"
            : "border-zinc-600 text-transparent hover:border-emerald-500"
      } ${className}`}
    >
      <Icon name="check" />
    </button>
  );
}

/** Lixeira por card/linha. `deleteAction(id)` deve retornar { error?, success? }. */
export function CardTrash({
  id,
  deleteAction,
  label = "este item",
  className = "",
}: {
  id: string;
  deleteAction: (id: string) => Promise<{ error?: string; success?: string }>;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function run() {
    startTransition(async () => {
      const result = await deleteAction(id);
      setConfirming(false);
      if (!result?.error) router.refresh();
    });
  }

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); run(); }}
          disabled={pending}
          className="rounded-md bg-red-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-red-700 disabled:opacity-60"
        >
          {pending ? "..." : "Confirmar"}
        </button>
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirming(false); }}
          className="rounded-md px-1.5 py-0.5 text-[11px] text-zinc-500 hover:text-zinc-100"
        >
          <Icon name="close" />
        </button>
      </span>
    );
  }
  return (
    <button
      type="button"
      title={`Excluir ${label}`}
      aria-label={`Excluir ${label}`}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirming(true); }}
      className={`rounded-md p-1 text-zinc-500 transition hover:bg-red-50 hover:text-red-600 ${className}`}
    >
      <Icon name="trash" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Barra flutuante de ações em massa
// ---------------------------------------------------------------------------

export type BulkMenu = {
  label: string;
  options: { value: string; label: string }[];
  run: (ids: string[], value: string) => Promise<BulkResult>;
};

/** Ação simples em massa (vira botão, sem dropdown). Ex.: Arquivar. */
export type BulkAction = {
  label: string;
  run: (ids: string[]) => Promise<BulkResult>;
};

export function BulkBar({
  entityLabel = "itens",
  deleteAction,
  menus = [],
  actions = [],
  raised = false,
}: {
  entityLabel?: string;
  deleteAction?: (ids: string[]) => Promise<BulkResult>;
  menus?: BulkMenu[];
  actions?: BulkAction[];
  /** eleva a barra (para não sobrepor outra BulkBar na mesma tela). */
  raised?: boolean;
}) {
  const { selected, clear, count } = useSelection();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  if (count === 0) return null;
  const ids = () => Array.from(selected);

  function apply(fn: () => Promise<BulkResult>) {
    setNote(null);
    startTransition(async () => {
      const r = await fn();
      if (r.error) setNote(r.error);
      else {
        setNote(r.success ?? `${r.ok} atualizado(s).`);
        clear();
        router.refresh();
        setTimeout(() => setNote(null), 2500);
      }
      setConfirmDel(false);
    });
  }

  return (
    <div
      className={`pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4 ${
        raised
          ? "bottom-20 max-lg:bottom-[calc(9rem+env(safe-area-inset-bottom))]"
          : "bottom-4 max-lg:bottom-[calc(4.75rem+env(safe-area-inset-bottom))]"
      }`}
    >
      <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-2xl border border-zinc-700 bg-zinc-900 px-3 py-2 shadow-[0_8px_24px_rgba(16,24,40,0.16)]">
        <span className="flex items-center gap-2 pr-1 text-sm">
          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-xs font-bold text-white">
            {count}
          </span>
          <span className="text-zinc-500 max-sm:hidden">{entityLabel} selecionado(s)</span>
        </span>

        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            disabled={pending}
            onClick={() => apply(() => a.run(ids()))}
            className="rounded-lg border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 transition hover:border-zinc-500 hover:text-white disabled:opacity-50"
          >
            {a.label}
          </button>
        ))}

        {menus.map((menu) => (
          <select
            key={menu.label}
            defaultValue=""
            disabled={pending}
            onChange={(e) => {
              const v = e.target.value;
              e.target.value = "";
              if (v) apply(() => menu.run(ids(), v));
            }}
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:border-emerald-500"
          >
            <option value="">{menu.label}</option>
            {menu.options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        ))}

        {deleteAction &&
          (confirmDel ? (
            <span className="flex items-center gap-1">
              <button
                type="button"
                disabled={pending}
                onClick={() => apply(() => deleteAction(ids()))}
                className="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
              >
                {pending ? "Excluindo..." : `Excluir ${count}`}
              </button>
              <button type="button" onClick={() => setConfirmDel(false)} className="rounded-lg px-2 py-1.5 text-xs text-zinc-500 hover:text-zinc-100">
                Cancelar
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDel(true)}
              className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100"
            >
              <Icon name="trash" /> Excluir
            </button>
          ))}

        <button type="button" onClick={clear} className="rounded-lg px-2 py-1.5 text-xs text-zinc-500 hover:text-zinc-100">
          Limpar
        </button>

        {note && <span className="pl-1 text-xs text-emerald-700">{note}</span>}
      </div>
    </div>
  );
}
