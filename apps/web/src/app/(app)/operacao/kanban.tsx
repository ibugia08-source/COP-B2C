"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ADS_META, AGENCY_BRAND_META, formatDate, HEALTH_META, TONE_CLASSES, type Tone } from "@/lib/labels";
import { Alert, Badge, Button, Field, Input, StatusBadge, Textarea, UserAvatar } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlay";
import { CardTrash, SelectCircle } from "@/components/bulk-select";
import { deleteClient, moveClientStage } from "./actions";

export type StageOption = { value: string; label: string; color: Tone };

export type KanbanClient = {
  id: string;
  name: string;
  niche: string | null;
  agencyBrand: string;
  healthStatus: string;
  adsStatus: string;
  pipelineStage: string;
  gestor1: string | null;
  estrategista: string | null;
  nextDue: string | null; // ISO
  pendencias: string[];
};

type PendingMove = { client: KanbanClient; toStage: string; kind: "PERDIDO" | "CRITICO" };

export function OperationKanban({
  clients,
  columns,
  canMove,
  canCreate,
  canDelete,
}: {
  clients: KanbanClient[];
  columns: StageOption[];
  canMove: boolean;
  canCreate: boolean;
  canDelete?: boolean;
}) {
  const router = useRouter();
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // campos dos modais obrigatórios
  const [churnReason, setChurnReason] = useState("");
  const [churnDate, setChurnDate] = useState("");
  const [criticalReason, setCriticalReason] = useState("");
  const [actionPlan, setActionPlan] = useState("");

  // clientes cuja etapa não tem coluna ativa (ex.: coluna desativada pelo admin)
  const known = new Set(columns.map((c) => c.value));
  const orphans = clients.filter((c) => !known.has(c.pipelineStage));
  const allColumns: StageOption[] = orphans.length
    ? [...columns, { value: "__outros__", label: "Sem coluna", color: "zinc" }]
    : columns;

  function doMove(client: KanbanClient, toStage: string, extras?: Parameters<typeof moveClientStage>[2]) {
    setError(null);
    startTransition(async () => {
      const result = await moveClientStage(client.id, toStage, extras);
      if (result.requires === "PERDIDO") {
        setChurnReason("");
        setChurnDate(new Date().toISOString().slice(0, 10));
        setPendingMove({ client, toStage, kind: "PERDIDO" });
      } else if (result.requires === "CRITICO") {
        setCriticalReason("");
        setActionPlan("");
        setPendingMove({ client, toStage, kind: "CRITICO" });
      } else if (result.error) {
        setToast(null);
        setError(result.error);
      } else {
        setPendingMove(null);
        setError(null);
        setToast(result.success ?? "Movido.");
        setTimeout(() => setToast(null), 2500);
        router.refresh();
      }
    });
  }

  function onDrop(stage: string) {
    setOverStage(null);
    if (!dragId || !canMove || stage === "__outros__") return;
    const client = clients.find((c) => c.id === dragId);
    setDragId(null);
    if (!client || client.pipelineStage === stage) return;
    doMove(client, stage);
  }

  return (
    <div>
      {error && (
        <div className="mb-3">
          <Alert>{error}</Alert>
        </div>
      )}
      {toast && (
        <div className="mb-3">
          <Alert tone="green">{toast}</Alert>
        </div>
      )}

      <div className={`flex gap-3 overflow-x-auto pb-4 ${isPending ? "opacity-70" : ""}`}>
        {allColumns.map((col) => {
          const stageClients =
            col.value === "__outros__" ? orphans : clients.filter((c) => c.pipelineStage === col.value);
          return (
            <div
              key={col.value}
              onDragOver={(e) => {
                if (canMove && col.value !== "__outros__") {
                  e.preventDefault();
                  setOverStage(col.value);
                }
              }}
              onDragLeave={() => setOverStage((s) => (s === col.value ? null : s))}
              onDrop={() => onDrop(col.value)}
              className={`flex w-64 shrink-0 flex-col rounded-xl border bg-zinc-900/50 ${
                overStage === col.value ? "border-emerald-500" : "border-zinc-800"
              }`}
            >
              <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
                  <span className={`inline-block h-2 w-2 rounded-full border ${TONE_CLASSES[col.color]}`} />
                  {col.label}
                </span>
                <span className="rounded-full bg-zinc-800 px-1.5 text-[10px] text-zinc-400">
                  {stageClients.length}
                </span>
              </div>
              <div className="flex min-h-24 flex-1 flex-col gap-2 p-2">
                {stageClients.length === 0 && (
                  <p className="py-3 text-center text-[11px] text-zinc-600">vazio</p>
                )}
                {stageClients.map((c) => (
                  <div
                    key={c.id}
                    draggable={canMove}
                    onDragStart={() => setDragId(c.id)}
                    onDragEnd={() => setDragId(null)}
                    className={`rounded-lg border border-zinc-800 bg-zinc-900 p-3 shadow-sm transition hover:border-zinc-600 ${
                      canMove ? "cursor-grab active:cursor-grabbing" : ""
                    } ${dragId === c.id ? "opacity-50" : ""}`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <SelectCircle id={c.id} />
                      {canDelete && <CardTrash id={c.id} deleteAction={deleteClient} label="cliente" />}
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/clientes/${c.id}`}
                        className="text-sm font-medium leading-tight text-zinc-100 hover:text-emerald-300"
                      >
                        {c.name}
                      </Link>
                      <UserAvatar name={c.gestor1} size="sm" title={`Gestor 1: ${c.gestor1 ?? "—"}`} />
                    </div>
                    {c.niche && <p className="mt-0.5 text-[11px] text-zinc-500">{c.niche}</p>}
                    <div className="mt-2 flex flex-wrap gap-1">
                      <StatusBadge value={c.agencyBrand} meta={AGENCY_BRAND_META} />
                      <StatusBadge value={c.healthStatus} meta={HEALTH_META} />
                      <StatusBadge value={c.adsStatus} meta={ADS_META} />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500">
                      <span title="Estrategista">🧠 {c.estrategista?.split(" ")[0] ?? "—"}</span>
                      <span title="Próximo prazo" className={c.nextDue && new Date(c.nextDue) < new Date() ? "text-red-400" : ""}>
                        ⏰ {c.nextDue ? formatDate(new Date(c.nextDue)) : "—"}
                      </span>
                    </div>
                    {c.pendencias.length > 0 && (
                      <div className="mt-2">
                        <Badge tone="amber">⚠ {c.pendencias.length} pendência{c.pendencias.length > 1 ? "s" : ""}</Badge>
                      </div>
                    )}
                  </div>
                ))}
                {canCreate && col.value !== "__outros__" && (
                  <Link
                    href={`/clientes/novo?etapa=${encodeURIComponent(col.value)}`}
                    className="mt-1 rounded-lg border border-dashed border-zinc-800 px-2 py-1.5 text-left text-[11px] text-zinc-500 transition hover:border-zinc-600 hover:text-zinc-300"
                  >
                    + Novo cliente nesta etapa
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal obrigatório: perdido */}
      <Modal
        open={pendingMove?.kind === "PERDIDO"}
        onClose={() => setPendingMove(null)}
        title={`Marcar "${pendingMove?.client.name}" como perdido`}
      >
        <div className="space-y-4">
          <Field label="Motivo do churn *">
            <Textarea value={churnReason} onChange={(e) => setChurnReason(e.target.value)} placeholder="Por que o cliente saiu?" />
          </Field>
          <Field label="Data da perda *">
            <Input type="date" value={churnDate} onChange={(e) => setChurnDate(e.target.value)} />
          </Field>
          {error && <Alert>{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPendingMove(null)}>Cancelar</Button>
            <Button
              variant="danger"
              disabled={isPending}
              onClick={() => pendingMove && doMove(pendingMove.client, pendingMove.toStage, { churnReason, churnDate })}
            >
              {isPending ? "Salvando..." : "Confirmar perda"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal obrigatório: crítico */}
      <Modal
        open={pendingMove?.kind === "CRITICO"}
        onClose={() => setPendingMove(null)}
        title={`Mover "${pendingMove?.client.name}" para Cliente Crítico`}
      >
        <div className="space-y-4">
          <Field label="Motivo *">
            <Textarea value={criticalReason} onChange={(e) => setCriticalReason(e.target.value)} placeholder="O que está acontecendo com a conta?" />
          </Field>
          <Field label="Plano de ação *">
            <Textarea value={actionPlan} onChange={(e) => setActionPlan(e.target.value)} placeholder="O que será feito para reverter?" />
          </Field>
          {error && <Alert>{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPendingMove(null)}>Cancelar</Button>
            <Button
              disabled={isPending}
              onClick={() => pendingMove && doMove(pendingMove.client, pendingMove.toStage, { criticalReason, actionPlan })}
            >
              {isPending ? "Salvando..." : "Confirmar e criar plano de ação"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
