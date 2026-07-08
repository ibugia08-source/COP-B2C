"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { METRIC_CATALOG, type MetricCategory, type MetricKey } from "@/lib/dashboard-metrics";
import { Alert, Button } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlay";
import {
  addMetric,
  restoreDefault,
  restoreGlobalDefault,
  setColumns,
  setGlobalDefault,
  setMetrics,
  type ActionState,
} from "./dashboard-actions";

const CATEGORIES: MetricCategory[] = ["Clientes", "Tarefas", "Ativos digitais", "Metas", "Alertas"];

export function DashboardControls({
  visible,
  columns,
  available,
  isAdmin,
}: {
  visible: MetricKey[];
  columns: number;
  // métricas que o usuário TEM permissão de ver (catálogo filtrado no servidor)
  available: MetricKey[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [modal, setModal] = useState<"add" | "edit" | "layout" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // estado local editável (Editar métricas)
  const [order, setOrder] = useState<MetricKey[]>(visible);
  const [cols, setCols] = useState(columns);

  const availableSet = new Set(available);
  const catalog = METRIC_CATALOG.filter((m) => availableSet.has(m.key));
  const notAdded = catalog.filter((m) => !visible.includes(m.key));

  function run(fn: () => Promise<ActionState>, close = true) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
      else {
        if (close) setModal(null);
        router.refresh();
      }
    });
  }

  function move(idx: number, dir: -1 | 1) {
    const next = [...order];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setOrder(next);
  }

  function toggle(key: MetricKey) {
    setOrder((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  const label = (key: MetricKey) => METRIC_CATALOG.find((m) => m.key === key)?.label ?? key;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="secondary" onClick={() => { setError(null); setModal("add"); }}>
        + Adicionar métrica
      </Button>
      <Button size="sm" variant="secondary" onClick={() => { setError(null); setOrder(visible); setModal("edit"); }}>
        Editar métricas
      </Button>
      <Button size="sm" variant="secondary" onClick={() => { setError(null); setCols(columns); setModal("layout"); }}>
        Editar layout
      </Button>

      {/* Adicionar métrica */}
      <Modal open={modal === "add"} onClose={() => setModal(null)} title="Adicionar métrica" wide>
        {notAdded.length === 0 ? (
          <p className="text-sm text-zinc-400">Todas as métricas disponíveis já estão no seu dashboard.</p>
        ) : (
          <div className="space-y-4">
            {CATEGORIES.map((cat) => {
              const items = notAdded.filter((m) => m.category === cat);
              if (!items.length) return null;
              return (
                <div key={cat}>
                  <p className="mb-1 text-xs font-semibold uppercase text-zinc-500">{cat}</p>
                  <div className="space-y-1">
                    {items.map((m) => (
                      <div key={m.key} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
                        <span className="text-sm text-zinc-200">{m.label}</span>
                        <Button size="sm" disabled={pending} onClick={() => run(() => addMetric(m.key), false)}>
                          Adicionar
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      </Modal>

      {/* Editar métricas: on/off + reordenar + restaurar padrão */}
      <Modal open={modal === "edit"} onClose={() => setModal(null)} title="Editar métricas" wide>
        <div className="space-y-4">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-zinc-500">Visíveis (ordem no dashboard)</p>
            {order.length === 0 ? (
              <p className="text-sm text-zinc-500">Nenhuma métrica selecionada.</p>
            ) : (
              <ul className="space-y-1">
                {order.map((key, i) => (
                  <li key={key} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5">
                    <span className="text-sm text-zinc-200">{label(key)}</span>
                    <span className="flex items-center gap-1">
                      <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded px-1.5 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800 disabled:opacity-30">↑</button>
                      <button type="button" onClick={() => move(i, 1)} disabled={i === order.length - 1} className="rounded px-1.5 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800 disabled:opacity-30">↓</button>
                      <button type="button" onClick={() => toggle(key)} className="rounded px-2 py-0.5 text-xs text-red-400 hover:bg-zinc-800">remover</button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {catalog.some((m) => !order.includes(m.key)) && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-zinc-500">Ocultas</p>
              <div className="flex flex-wrap gap-1.5">
                {catalog.filter((m) => !order.includes(m.key)).map((m) => (
                  <button key={m.key} type="button" onClick={() => toggle(m.key)} className="rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300 hover:border-emerald-600 hover:text-emerald-300">
                    + {m.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {error && <Alert>{error}</Alert>}
          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => restoreDefault())}>
              Restaurar padrão
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setModal(null)}>Cancelar</Button>
              <Button disabled={pending} onClick={() => run(() => setMetrics(order))}>
                {pending ? "Salvando..." : "Salvar métricas"}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Editar layout: colunas + ações de admin */}
      <Modal open={modal === "layout"} onClose={() => setModal(null)} title="Editar layout">
        <div className="space-y-4">
          <div>
            <p className="mb-1 text-sm font-medium text-zinc-300">Cards por linha</p>
            <div className="flex gap-2">
              {[2, 3, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCols(n)}
                  className={`rounded-lg border px-4 py-2 text-sm transition ${
                    cols === n ? "border-emerald-500 bg-emerald-950/60 text-emerald-300" : "border-zinc-700 text-zinc-300 hover:border-zinc-500"
                  }`}
                >
                  {n} colunas
                </button>
              ))}
            </div>
          </div>

          {isAdmin && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
              <p className="mb-2 text-xs font-semibold uppercase text-zinc-500">Administração</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => setGlobalDefault(), false)}>
                  Definir como padrão dos novos usuários
                </Button>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => restoreGlobalDefault(), false)}>
                  Restaurar padrão global
                </Button>
              </div>
            </div>
          )}

          {error && <Alert>{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModal(null)}>Cancelar</Button>
            <Button disabled={pending} onClick={() => run(() => setColumns(cols))}>
              {pending ? "Salvando..." : "Salvar layout"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
