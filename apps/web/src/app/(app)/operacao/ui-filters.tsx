"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { ADS_META, AGENCY_BRAND_META, HEALTH_META } from "@/lib/labels";

const selectClass =
  "rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:border-emerald-600";

export const OPERATION_FILTER_KEYS = [
  "etapa",
  "cliente",
  "responsavel",
  "gestor",
  "estrategista",
  "saude",
  "empresa",
  "nicho",
  "ads",
  "servico",
] as const;

type Opt = { value: string; label: string };

export function OperationFilters({
  users,
  clients,
  niches,
  services,
  stageOptions,
}: {
  users: { id: string; name: string }[];
  clients: { id: string; name: string }[];
  niches: string[];
  services: string[];
  stageOptions: Opt[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => router.replace(`${pathname}?${next.toString()}`));
  }
  const sel = (key: string) => params.get(key) ?? "";
  const hasFilters = OPERATION_FILTER_KEYS.some((k) => params.get(k));

  const userSelect = (key: string, label: string) => (
    <select className={selectClass} value={sel(key)} onChange={(e) => setParam(key, e.target.value)}>
      <option value="">{label}: todos</option>
      {users.map((u) => (
        <option key={u.id} value={u.id}>{u.name}</option>
      ))}
    </select>
  );

  return (
    <div className={`mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-2 ${pending ? "opacity-60" : ""}`}>
      <select className={selectClass} value={sel("etapa")} onChange={(e) => setParam("etapa", e.target.value)}>
        <option value="">Coluna/etapa: todas</option>
        {stageOptions.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
      <select className={selectClass} value={sel("cliente")} onChange={(e) => setParam("cliente", e.target.value)}>
        <option value="">Cliente: todos</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      {userSelect("responsavel", "Responsável")}
      {userSelect("gestor", "Gestor")}
      {userSelect("estrategista", "Estrategista")}
      <select className={selectClass} value={sel("saude")} onChange={(e) => setParam("saude", e.target.value)}>
        <option value="">Saúde: todas</option>
        {Object.entries(HEALTH_META).map(([v, m]) => (
          <option key={v} value={v}>{m.label}</option>
        ))}
      </select>
      <select className={selectClass} value={sel("empresa")} onChange={(e) => setParam("empresa", e.target.value)}>
        <option value="">Empresa: todas</option>
        {Object.entries(AGENCY_BRAND_META).map(([v, m]) => (
          <option key={v} value={v}>{m.label}</option>
        ))}
      </select>
      <select className={selectClass} value={sel("nicho")} onChange={(e) => setParam("nicho", e.target.value)}>
        <option value="">Nicho: todos</option>
        {niches.map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
      <select className={selectClass} value={sel("ads")} onChange={(e) => setParam("ads", e.target.value)}>
        <option value="">Ads: todos</option>
        {Object.entries(ADS_META).map(([v, m]) => (
          <option key={v} value={v}>{m.label}</option>
        ))}
      </select>
      <select className={selectClass} value={sel("servico")} onChange={(e) => setParam("servico", e.target.value)}>
        <option value="">Serviço: todos</option>
        {services.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      {hasFilters && (
        <button
          type="button"
          onClick={() => {
            const next = new URLSearchParams(params.toString());
            for (const k of OPERATION_FILTER_KEYS) next.delete(k);
            startTransition(() => router.replace(`${pathname}?${next.toString()}`));
          }}
          className="rounded-lg px-2 py-1.5 text-xs text-zinc-500 hover:text-white"
        >
          Limpar filtros
        </button>
      )}
    </div>
  );
}
