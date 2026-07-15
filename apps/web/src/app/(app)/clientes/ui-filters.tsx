"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import {
  ADS_META,
  AGENCY_BRAND_META,
  BUSINESS_MODEL_LABEL,
  CLIENT_STATUS_META,
  HEALTH_META,
} from "@/lib/labels";

const selectClass =
  "rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:border-emerald-600";

export function ClientFilters({
  users,
  niches,
  statuses,
  healths,
  adsStatuses,
  brands,
  models,
}: {
  users: { id: string; name: string }[];
  niches: string[];
  statuses: string[];
  healths: string[];
  adsStatuses: string[];
  brands: string[];
  models: string[];
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
  const hasFilters = ["q", "status", "saude", "ads", "empresa", "modelo", "nicho", "estrategista", "gestor1", "gestor2", "responsavel", "ordenar"].some((k) => params.get(k));

  return (
    <div className={`mb-4 flex flex-wrap items-center gap-2 ${pending ? "opacity-60" : ""}`}>
      <input
        defaultValue={sel("q")}
        placeholder="Buscar por nome..."
        className={`${selectClass} w-44`}
        onKeyDown={(e) => {
          if (e.key === "Enter") setParam("q", (e.target as HTMLInputElement).value);
        }}
        onBlur={(e) => e.target.value !== sel("q") && setParam("q", e.target.value)}
      />
      <select className={selectClass} value={sel("status")} onChange={(e) => setParam("status", e.target.value)}>
        <option value="">Status: todos</option>
        {statuses.map((s) => (
          <option key={s} value={s}>{CLIENT_STATUS_META[s]?.label ?? s}</option>
        ))}
      </select>
      <select className={selectClass} value={sel("saude")} onChange={(e) => setParam("saude", e.target.value)}>
        <option value="">Saúde: todas</option>
        {healths.map((s) => (
          <option key={s} value={s}>{HEALTH_META[s]?.label ?? s}</option>
        ))}
      </select>
      <select className={selectClass} value={sel("ads")} onChange={(e) => setParam("ads", e.target.value)}>
        <option value="">Ads: todos</option>
        {adsStatuses.map((s) => (
          <option key={s} value={s}>{ADS_META[s]?.label ?? s}</option>
        ))}
      </select>
      <select className={selectClass} value={sel("empresa")} onChange={(e) => setParam("empresa", e.target.value)}>
        <option value="">Empresa: todas</option>
        {brands.map((b) => (
          <option key={b} value={b}>{AGENCY_BRAND_META[b]?.label ?? b}</option>
        ))}
      </select>
      <select className={selectClass} value={sel("modelo")} onChange={(e) => setParam("modelo", e.target.value)}>
        <option value="">Modelo: todos</option>
        {models.map((m) => (
          <option key={m} value={m}>{BUSINESS_MODEL_LABEL[m] ?? m}</option>
        ))}
      </select>
      <select className={selectClass} value={sel("nicho")} onChange={(e) => setParam("nicho", e.target.value)}>
        <option value="">Nicho: todos</option>
        {niches.map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
      <select className={selectClass} value={sel("estrategista")} onChange={(e) => setParam("estrategista", e.target.value)}>
        <option value="">Estrategista</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>{u.name}</option>
        ))}
      </select>
      <select className={selectClass} value={sel("gestor1")} onChange={(e) => setParam("gestor1", e.target.value)}>
        <option value="">Gestor 1</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>{u.name}</option>
        ))}
      </select>
      <select className={selectClass} value={sel("gestor2")} onChange={(e) => setParam("gestor2", e.target.value)}>
        <option value="">Gestor 2</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>{u.name}</option>
        ))}
      </select>
      <select className={selectClass} value={sel("responsavel")} onChange={(e) => setParam("responsavel", e.target.value)}>
        <option value="">Responsável</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>{u.name}</option>
        ))}
      </select>
      <select className={selectClass} value={sel("ordenar")} onChange={(e) => setParam("ordenar", e.target.value)}>
        <option value="">Ordenar: recente</option>
        <option value="nome">Nome</option>
        <option value="entrada">Data de entrada</option>
        <option value="status">Status</option>
        <option value="saude">Saúde</option>
      </select>
      {hasFilters && (
        <button
          type="button"
          onClick={() => {
            // preserva o modo de visualização e a visão (Kanban/Calendário) ao limpar
            const next = new URLSearchParams();
            const m = params.get("modo");
            if (m) next.set("modo", m);
            const v = params.get("visao");
            if (v) next.set("visao", v);
            const qs = next.toString();
            startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname));
          }}
          className="rounded-lg px-2 py-1.5 text-xs text-zinc-500 hover:text-white"
        >
          Limpar filtros
        </button>
      )}
    </div>
  );
}
