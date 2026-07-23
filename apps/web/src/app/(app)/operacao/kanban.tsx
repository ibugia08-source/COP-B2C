"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ADS_META, AGENCY_BRAND_META, HEALTH_META, TONE_CLASSES, type Tone } from "@/lib/labels";
import { formatDateOnly, isDateOnlyOverdue, todayDateOnly } from "@/lib/date";
import { Alert, Badge, Button, Field, Input, StatusBadge, Textarea, UserAvatar } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlay";
import { useBoardPan } from "@/components/use-board-pan";
import { Icon } from "@/components/ui/icon";
import { CardTrash, SelectCircle } from "@/components/bulk-select";
import { MoveMenu } from "@/components/ui/move-menu";
import { deleteClient, moveClientStage, reorderClientOnBoard } from "./actions";

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
  gestor1Avatar?: string | null;
  estrategista: string | null;
  nextDue: string | null; // data-only 'YYYY-MM-DD'
  pendencias: string[];
};

type PendingMove = { client: KanbanClient; toStage: string; kind: "PERDIDO" };

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
  const { ref: boardRef, panProps } = useBoardPan<HTMLDivElement>();

  // campos do modal obrigatório de churn
  const [churnReason, setChurnReason] = useState("");
  const [churnDate, setChurnDate] = useState("");

  // clientes cuja etapa não tem coluna ativa (ex.: coluna desativada pelo admin)
  const known = new Set(columns.map((c) => c.value));
  const orphans = clients.filter((c) => !known.has(c.pipelineStage));
  const allColumns: StageOption[] = orphans.length
    ? [...columns, { value: "__outros__", label: "Sem coluna", color: "zinc" }]
    : columns;
  const moveOptions = columns.map((c) => ({ value: c.value, label: c.label }));

  function doMove(client: KanbanClient, toStage: string, extras?: Parameters<typeof moveClientStage>[2]) {
    setError(null);
    startTransition(async () => {
      const result = await moveClientStage(client.id, toStage, extras);
      if (result.requires === "PERDIDO") {
        setChurnReason("");
        setChurnDate(todayDateOnly());
        setPendingMove({ client, toStage, kind: "PERDIDO" });
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

  function doReorder(clientId: string, beforeClientId: string | null) {
    setError(null);
    startTransition(async () => {
      const result = await reorderClientOnBoard(clientId, beforeClientId);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  function onDrop(stage: string) {
    setOverStage(null);
    if (!dragId || !canMove || stage === "__outros__") return;
    const client = clients.find((c) => c.id === dragId);
    setDragId(null);
    if (!client) return;
    // soltar na área da coluna: mesma coluna = manda para o fim; outra = move etapa
    if (client.pipelineStage === stage) doReorder(client.id, null);
    else doMove(client, stage);
  }

  // soltar SOBRE um card: mesma coluna = reordena antes dele; outra = move etapa
  function onDropCard(targetId: string, targetStage: string) {
    setOverStage(null);
    const draggedId = dragId;
    setDragId(null);
    if (!draggedId || !canMove || draggedId === targetId) return;
    const dragged = clients.find((c) => c.id === draggedId);
    if (!dragged) return;
    if (dragged.pipelineStage === targetStage) doReorder(draggedId, targetId);
    else doMove(dragged, targetStage);
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

      <div
        ref={boardRef}
        {...panProps}
        className={`flex cursor-grab gap-3 overflow-x-auto pb-4 active:cursor-grabbing ${isPending ? "opacity-70" : ""}`}
      >
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
              <div className="flex flex-col gap-2 p-2">
                <div className="flex max-h-[32rem] flex-col gap-2 overflow-y-scroll pr-1 [scrollbar-gutter:stable]">
                {stageClients.length === 0 && (
                  <p className="py-3 text-center text-[11px] text-zinc-600">vazio</p>
                )}
                {stageClients.map((c) => (
                  <div
                    key={c.id}
                    draggable={canMove}
                    onDragStart={() => setDragId(c.id)}
                    onDragEnd={() => setDragId(null)}
                    onDragOver={(e) => {
                      if (canMove && dragId && dragId !== c.id) {
                        e.preventDefault();
                        e.stopPropagation();
                      }
                    }}
                    onDrop={(e) => {
                      e.stopPropagation();
                      onDropCard(c.id, col.value);
                    }}
                    className={`rounded-lg border border-zinc-800 bg-zinc-900 p-3 shadow-sm transition hover:border-zinc-600 ${
                      canMove ? "cursor-grab active:cursor-grabbing" : ""
                    } ${dragId === c.id ? "opacity-50" : ""} ${
                      dragId && dragId !== c.id ? "hover:border-emerald-500" : ""
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <SelectCircle id={c.id} />
                      <div className="flex items-center gap-0.5">
                        {canMove && (
                          <MoveMenu
                            options={moveOptions}
                            currentValue={c.pipelineStage}
                            onMove={(v) => doMove(c, v)}
                            disabled={isPending}
                            title={`Mover "${c.name}" para…`}
                          />
                        )}
                        {canDelete && <CardTrash id={c.id} deleteAction={deleteClient} label="cliente" />}
                      </div>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/clientes/${c.id}`}
                        className="text-sm font-medium leading-tight text-zinc-100 hover:text-emerald-300"
                      >
                        {c.name}
                      </Link>
                      <UserAvatar name={c.gestor1} size="sm" title={`Gestor 1: ${c.gestor1 ?? "—"}`} src={c.gestor1Avatar} />
                    </div>
                    {c.niche && <p className="mt-0.5 text-[11px] text-zinc-500">{c.niche}</p>}
                    <div className="mt-2 flex flex-wrap gap-1">
                      <StatusBadge value={c.agencyBrand} meta={AGENCY_BRAND_META} />
                      <StatusBadge value={c.healthStatus} meta={HEALTH_META} />
                      <StatusBadge value={c.adsStatus} meta={ADS_META} />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500">
                      <span title="Estrategista"><Icon name="brain" /> {c.estrategista?.split(" ")[0] ?? "—"}</span>
                      <span title="Próximo prazo" className={isDateOnlyOverdue(c.nextDue) ? "text-red-400" : ""}>
                        <Icon name="clock" /> {formatDateOnly(c.nextDue)}
                      </span>
                    </div>
                    {c.pendencias.length > 0 && (
                      <div className="mt-2">
                        <Badge tone="amber"><Icon name="warning" /> {c.pendencias.length} pendência{c.pendencias.length > 1 ? "s" : ""}</Badge>
                      </div>
                    )}
                  </div>
                ))}
                </div>
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
    </div>
  );
}
