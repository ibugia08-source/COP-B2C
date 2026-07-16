"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { AGENCY_BRAND_META } from "@/lib/labels";

const selectClass =
  "rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-300 outline-none transition focus:border-emerald-600";

export function DashboardFilterBar({
  users,
  niches,
  current,
}: {
  users: { id: string; name: string }[];
  niches: string[];
  /** filtro EFETIVO (URL ou padrão salvo do usuário) — para a barra refletir o que está aplicado */
  current: { empresa: string; gestor: string; nicho: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const push = (next: URLSearchParams) => {
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };
  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    push(next);
  }
  function clearAll() {
    const next = new URLSearchParams(params.toString());
    for (const k of ["empresa", "gestor", "nicho"]) next.delete(k);
    push(next);
  }
  // "Limpar" reflete só os overrides feitos na URL; o valor exibido nos selects
  // vem do filtro EFETIVO para a barra não mentir sobre o que está aplicado.
  const urlActive = ["empresa", "gestor", "nicho"].filter((k) => params.get(k)).length;

  return (
    <div className={`mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-2 ${pending ? "opacity-60" : ""}`}>
      <select className={selectClass} value={current.empresa} onChange={(e) => setParam("empresa", e.target.value)}>
        <option value="">Empresa: todas</option>
        {Object.entries(AGENCY_BRAND_META).map(([v, m]) => (
          <option key={v} value={v}>{m.label}</option>
        ))}
      </select>
      <select className={selectClass} value={current.gestor} onChange={(e) => setParam("gestor", e.target.value)}>
        <option value="">Gestor: todos</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>{u.name}</option>
        ))}
      </select>
      <select className={selectClass} value={current.nicho} onChange={(e) => setParam("nicho", e.target.value)}>
        <option value="">Nicho: todos</option>
        {niches.map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
      {urlActive > 0 && (
        <button
          type="button"
          onClick={clearAll}
          className="rounded-lg px-2 py-1.5 text-xs font-medium text-emerald-400 transition hover:text-emerald-300"
        >
          Limpar ({urlActive})
        </button>
      )}
    </div>
  );
}
