"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Icon } from "@/components/ui/icon";

// ---------------------------------------------------------------------------
// FilterBar unificado — filtro instantâneo, guardado na URL, com estado ativo,
// contagem de resultados e "limpar". Substitui os vários sistemas de filtro
// paralelos (Operação, Clientes, Ativos, Documentos, Metas...).
// ---------------------------------------------------------------------------

const controlCls =
  "rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-300 outline-none transition focus:border-emerald-600";

/** Núcleo reutilizável: lê/escreve parâmetros de filtro na URL, sem recarregar. */
export function useUrlFilters(keys: readonly string[], opts?: { preserve?: readonly string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const push = (next: URLSearchParams) => {
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  const get = (key: string) => params.get(key) ?? "";
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    push(next);
  };
  const clear = () => {
    const next = new URLSearchParams();
    for (const p of opts?.preserve ?? []) {
      const v = params.get(p);
      if (v) next.set(p, v);
    }
    push(next);
  };
  const activeCount = keys.filter((k) => params.get(k)).length;

  return { get, set, clear, activeCount, pending };
}

export type FilterOption = { value: string; label: string };
export type FilterDef =
  | { key: string; kind: "select"; label: string; options: FilterOption[]; width?: string }
  | { key: string; kind: "search"; placeholder?: string; width?: string };

export function FilterBar({
  filters,
  preserve,
  resultCount,
  className = "",
}: {
  filters: FilterDef[];
  /** parâmetros que "Limpar" deve preservar (ex.: modo/visão/aba) */
  preserve?: readonly string[];
  resultCount?: number;
  className?: string;
}) {
  const keys = filters.map((f) => f.key);
  const { get, set, clear, activeCount, pending } = useUrlFilters(keys, { preserve });

  const right = resultCount != null || activeCount > 0;

  return (
    <div
      className={`mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-2 ${
        pending ? "opacity-60" : ""
      } ${className}`}
    >
      {filters.map((f) =>
        f.kind === "search" ? (
          <SearchField
            key={f.key}
            value={get(f.key)}
            placeholder={f.placeholder ?? "Buscar..."}
            width={f.width ?? "w-48"}
            onCommit={(v) => set(f.key, v)}
          />
        ) : (
          <select
            key={f.key}
            className={`${controlCls} ${f.width ?? ""}`}
            value={get(f.key)}
            onChange={(e) => set(f.key, e.target.value)}
          >
            <option value="">{f.label}: todos</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ),
      )}

      {right && (
        <div className="ml-auto flex items-center gap-3">
          {resultCount != null && (
            <span className="text-xs text-zinc-500 nums">
              {resultCount} resultado{resultCount === 1 ? "" : "s"}
            </span>
          )}
          {activeCount > 0 && (
            <button
              type="button"
              onClick={clear}
              className="rounded-lg px-2 py-1.5 text-xs font-medium text-emerald-400 transition hover:text-emerald-300"
            >
              Limpar ({activeCount})
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SearchField({
  value,
  placeholder,
  width,
  onCommit,
}: {
  value: string;
  placeholder: string;
  width: string;
  onCommit: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  // sincroniza quando a URL muda por fora (ex.: botão "Limpar")
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocal(value);
  }, [value]);

  return (
    <span className="relative">
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-zinc-500">
        <Icon name="search" />
      </span>
      <input
        value={local}
        placeholder={placeholder}
        className={`${controlCls} pl-8 ${width}`}
        onChange={(e) => setLocal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommit(local);
        }}
        onBlur={() => {
          if (local !== value) onCommit(local);
        }}
      />
    </span>
  );
}
