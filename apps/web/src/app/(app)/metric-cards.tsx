"use client";

import Link from "next/link";
import { useState } from "react";
import { Modal } from "@/components/ui/overlay";
import { EmptyState, StatCard } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import type { MetricItem } from "@/lib/dashboard-lists";
import { fetchMetricItems } from "./dashboard-actions";

export type MetricCard = {
  key: string;
  label: string;
  value: number;
  tone?: string;
  hint?: string;
  /** fallback: link para a tela completa, exibido no rodapé do modal */
  href?: string;
};

/**
 * Grade de métricas do dashboard. Clicar num card abre um MODAL com o
 * detalhamento do que compõe aquele número (em vez de navegar para a tela).
 *
 * O modal é somente-leitura: cada item leva ao registro. Ação direta (concluir,
 * reatribuir) ficou fora de propósito — exigiria permissão por item e
 * revalidação; o link cobre o caso de uso sem esse risco.
 */
export function MetricCards({
  metrics,
  filters,
  gridClass,
}: {
  metrics: MetricCard[];
  filters: { empresa?: string; gestor?: string; nicho?: string };
  gridClass: string;
}) {
  const [open, setOpen] = useState<MetricCard | null>(null);
  const [items, setItems] = useState<MetricItem[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function openMetric(card: MetricCard) {
    setOpen(card);
    setItems(null);
    setError(null);
    setTruncated(false);
    setLoading(true);
    const result = await fetchMetricItems(card.key, filters);
    setLoading(false);
    if (result.error) setError(result.error);
    else {
      setItems(result.items ?? []);
      setTruncated(!!result.truncated);
    }
  }

  return (
    <>
      <div className={`mb-6 grid gap-3 ${gridClass}`}>
        {metrics.map((m) => (
          <StatCard
            key={m.key}
            label={m.label}
            value={m.value}
            tone={m.tone}
            hint={m.hint}
            onClick={() => openMetric(m)}
          />
        ))}
      </div>

      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.label ?? ""} wide>
        {loading && <p className="py-6 text-center text-sm text-zinc-500">Carregando…</p>}

        {error && (
          <div className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {items && items.length === 0 && (
          <EmptyState icon="chart" title="Nada por aqui" description="Nenhum item compõe esta métrica agora." />
        )}

        {items && items.length > 0 && (
          <ul className="divide-y divide-zinc-800">
            {items.map((it) => (
              <li key={it.id}>
                <Link
                  href={it.href}
                  className="flex items-center justify-between gap-3 px-1 py-2.5 transition hover:bg-zinc-800/40"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-zinc-100">{it.title}</span>
                    {it.subtitle && (
                      <span className="block truncate text-[11px] text-zinc-500">{it.subtitle}</span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {it.meta && (
                      <span className={`text-[11px] ${it.alert ? "text-red-400" : "text-zinc-500"}`}>
                        {it.meta}
                      </span>
                    )}
                    <Icon name="chevronRight" className="text-[10px] text-zinc-600" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {truncated && (
          <p className="mt-3 text-[11px] text-amber-400">
            Mostrando os primeiros {items?.length} itens. Abra a tela completa para ver todos.
          </p>
        )}

        {open?.href && (
          <div className="mt-4 border-t border-zinc-800 pt-3">
            <Link href={open.href} className="text-sm text-emerald-400 hover:underline">
              Abrir tela completa <Icon name="chevronRight" className="text-[10px]" />
            </Link>
          </div>
        )}
      </Modal>
    </>
  );
}
