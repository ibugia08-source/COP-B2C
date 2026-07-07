"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { AGENCY_BRAND_META } from "@/lib/labels";

const selectClass =
  "rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:border-emerald-600";

export function DashboardFilterBar({
  users,
  niches,
}: {
  users: { id: string; name: string }[];
  niches: string[];
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
  const sel = (k: string) => params.get(k) ?? "";

  return (
    <div className={`mb-4 flex flex-wrap gap-2 ${pending ? "opacity-60" : ""}`}>
      <select className={selectClass} value={sel("empresa")} onChange={(e) => setParam("empresa", e.target.value)}>
        <option value="">Empresa: todas</option>
        {Object.entries(AGENCY_BRAND_META).map(([v, m]) => (
          <option key={v} value={v}>{m.label}</option>
        ))}
      </select>
      <select className={selectClass} value={sel("gestor")} onChange={(e) => setParam("gestor", e.target.value)}>
        <option value="">Gestor: todos</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>{u.name}</option>
        ))}
      </select>
      <select className={selectClass} value={sel("nicho")} onChange={(e) => setParam("nicho", e.target.value)}>
        <option value="">Nicho: todos</option>
        {niches.map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
    </div>
  );
}
