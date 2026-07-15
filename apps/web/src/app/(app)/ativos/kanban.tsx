"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ASSET_PLATFORM_LABEL, ASSET_TYPE_LABEL, TONE_CLASSES, type Tone } from "@/lib/labels";
import { Alert, Badge, Button, Field, Input, Textarea, UserAvatar } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/overlay";
import { CardTrash, SelectCircle } from "@/components/bulk-select";
import { changeAssetStatus, deleteAsset, moveAssetToGroup, quickCreateAsset } from "./actions";

export type KanbanColumn = { value: string; label: string; color: Tone };

export type AssetCardData = {
  id: string;
  title: string;
  assetType: string;
  platform: string;
  status: string;
  groupId: string;
  groupName: string;
  clientName: string | null;
  assignedName: string | null;
  secretCount: number;
  attachmentCount: number;
  reviewPending: boolean;
  nextReview: string | null;
};

function AssetCard({
  asset,
  mode,
  draggable,
  onDragStart,
  onDragEnd,
  dragging,
  canDelete,
}: {
  asset: AssetCardData;
  mode: "status" | "group";
  draggable: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  dragging: boolean;
  canDelete?: boolean;
}) {
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`rounded-lg border border-zinc-800 bg-zinc-900 p-3 transition hover:border-zinc-600 ${
        draggable ? "cursor-grab active:cursor-grabbing" : ""
      } ${dragging ? "opacity-50" : ""}`}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <SelectCircle id={asset.id} />
        {canDelete && <CardTrash id={asset.id} deleteAction={deleteAsset} label="ativo" />}
      </div>
      <div className="flex items-start justify-between gap-2">
        <Link href={`/ativos/${asset.id}`} className="text-sm font-medium leading-tight text-zinc-100 hover:text-emerald-300">
          {asset.title}
        </Link>
        {asset.assignedName && <UserAvatar name={asset.assignedName} size="sm" title={asset.assignedName} />}
      </div>
      <p className="mt-0.5 text-[11px] text-zinc-500">
        {ASSET_TYPE_LABEL[asset.assetType] ?? asset.assetType} · {ASSET_PLATFORM_LABEL[asset.platform] ?? asset.platform}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {asset.secretCount > 0 && <Badge tone="purple"><Icon name="lock" /> {asset.secretCount}</Badge>}
        {asset.attachmentCount > 0 && <Badge tone="blue"><Icon name="attachment" /> {asset.attachmentCount}</Badge>}
        {asset.reviewPending && <Badge tone="amber"><Icon name="clock" /> revisar</Badge>}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500">
        <span className="truncate">{mode === "status" ? (asset.clientName ?? asset.groupName) : (asset.clientName ?? "interno")}</span>
      </div>
    </div>
  );
}

// Statuses que exigem entrada extra ao arrastar o card
const NEEDS_INPUT = new Set(["BLOQUEADA", "SENDO_ESQUENTADA"]);

export function AssetKanban({
  assets,
  mode,
  columns,
  canUpdate,
  canCreate,
  canDelete,
  quickAddGroupId,
  quickAddStatus,
  quickAddClientId,
}: {
  assets: AssetCardData[];
  mode: "status" | "group";
  columns: KanbanColumn[];
  canUpdate: boolean;
  canCreate: boolean;
  canDelete?: boolean;
  quickAddGroupId?: string; // grupo padrão para quick-add no modo status
  quickAddStatus?: string; // status padrão para quick-add no modo grupo
  quickAddClientId?: string;
}) {
  const router = useRouter();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // modal de regra (bloqueio/esquentamento) ao arrastar
  const [ruleModal, setRuleModal] = useState<{ assetId: string; status: string } | null>(null);
  const [reason, setReason] = useState("");
  const [reviewDays, setReviewDays] = useState("7");

  const key = (c: AssetCardData) => (mode === "status" ? c.status : c.groupId);
  const known = new Set(columns.map((c) => c.value));
  const orphans = assets.filter((c) => !known.has(key(c)));
  const allColumns: KanbanColumn[] = orphans.length
    ? [...columns, { value: "__outros__", label: mode === "status" ? "Sem coluna" : "Sem grupo", color: "zinc" }]
    : columns;

  function applyMove(assetId: string, target: string, extra?: { reason?: string; nextReviewDays?: number }) {
    setError(null);
    startTransition(async () => {
      const result =
        mode === "status"
          ? await changeAssetStatus(assetId, target, extra?.reason ?? "", { nextReviewDays: extra?.nextReviewDays })
          : await moveAssetToGroup(assetId, target);
      if (mode === "status" && (result as { requires?: string }).requires === "BLOQUEADA") {
        setReason("");
        setRuleModal({ assetId, status: target });
      } else if (result.error) {
        setToast(null);
        setError(result.error);
      } else {
        setRuleModal(null);
        setToast(result.success ?? "Movido.");
        setTimeout(() => setToast(null), 2000);
        router.refresh();
      }
    });
  }

  function onDrop(target: string) {
    setOverCol(null);
    if (!dragId || !canUpdate || target === "__outros__") return;
    const asset = assets.find((a) => a.id === dragId);
    setDragId(null);
    if (!asset || key(asset) === target) return;
    if (mode === "status" && NEEDS_INPUT.has(target)) {
      setReason("");
      setReviewDays("7");
      setRuleModal({ assetId: asset.id, status: target });
      return;
    }
    applyMove(asset.id, target);
  }

  return (
    <div>
      {error && <div className="mb-3"><Alert>{error}</Alert></div>}
      {toast && <div className="mb-3"><Alert tone="green">{toast}</Alert></div>}

      <div className={`flex gap-3 overflow-x-auto pb-4 ${isPending ? "opacity-70" : ""}`}>
        {allColumns.map((col) => {
          const items = col.value === "__outros__" ? orphans : assets.filter((a) => key(a) === col.value);
          return (
            <div
              key={col.value}
              onDragOver={(e) => {
                if (canUpdate && col.value !== "__outros__") {
                  e.preventDefault();
                  setOverCol(col.value);
                }
              }}
              onDragLeave={() => setOverCol((c) => (c === col.value ? null : c))}
              onDrop={() => onDrop(col.value)}
              className={`flex w-64 shrink-0 flex-col rounded-xl border bg-zinc-900/50 ${
                overCol === col.value ? "border-emerald-500" : "border-zinc-800"
              }`}
            >
              <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
                <span className="flex items-center gap-1.5 truncate text-xs font-semibold text-zinc-300" title={col.label}>
                  <span className={`inline-block h-2 w-2 shrink-0 rounded-full border ${TONE_CLASSES[col.color]}`} />
                  {col.label}
                </span>
                <span className="rounded-full bg-zinc-800 px-1.5 text-[10px] text-zinc-400">{items.length}</span>
              </div>
              <div className="flex min-h-24 flex-1 flex-col gap-2 p-2">
                {items.length === 0 && <p className="py-3 text-center text-[11px] text-zinc-600">vazio</p>}
                {items.map((a) => (
                  <AssetCard
                    key={a.id}
                    asset={a}
                    mode={mode}
                    draggable={canUpdate}
                    onDragStart={() => setDragId(a.id)}
                    onDragEnd={() => setDragId(null)}
                    dragging={dragId === a.id}
                    canDelete={canDelete}
                  />
                ))}
                {canCreate && col.value !== "__outros__" && (
                  <QuickAdd
                    onCreate={(title) =>
                      quickCreateAsset(title, {
                        status: mode === "status" ? col.value : quickAddStatus,
                        groupId: mode === "group" ? col.value : quickAddGroupId,
                        clientId: quickAddClientId ?? null,
                      })
                    }
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal de regra: bloqueio (motivo) / esquentamento (revisão) */}
      <Modal
        open={!!ruleModal}
        onClose={() => setRuleModal(null)}
        title={ruleModal?.status === "BLOQUEADA" ? "Bloquear ativo" : "Colocar ativo para esquentar"}
      >
        <div className="space-y-4">
          {ruleModal?.status === "BLOQUEADA" ? (
            <Field label="Motivo do bloqueio *">
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Por que a conta/ativo foi bloqueada?" />
            </Field>
          ) : (
            <>
              <Field label="Próxima revisão (dias)">
                <Input type="number" min="1" value={reviewDays} onChange={(e) => setReviewDays(e.target.value)} />
              </Field>
              <Field label="Observação (opcional)">
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Contexto do aquecimento" />
              </Field>
            </>
          )}
          {error && <Alert>{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRuleModal(null)}>Cancelar</Button>
            <Button
              variant={ruleModal?.status === "BLOQUEADA" ? "danger" : "primary"}
              disabled={isPending}
              onClick={() =>
                ruleModal &&
                applyMove(ruleModal.assetId, ruleModal.status, {
                  reason,
                  nextReviewDays: ruleModal.status === "SENDO_ESQUENTADA" ? Number(reviewDays) : undefined,
                })
              }
            >
              {isPending ? "Salvando..." : "Confirmar"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function QuickAdd({ onCreate }: { onCreate: (title: string) => Promise<{ error?: string; success?: string }> }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!title.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await onCreate(title);
      if (result.error) setError(result.error);
      else {
        setTitle("");
        setEditing(false);
        router.refresh();
      }
    });
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="mt-1 rounded-lg border border-dashed border-zinc-800 px-2 py-1.5 text-left text-[11px] text-zinc-500 transition hover:border-zinc-600 hover:text-zinc-300"
      >
        + Adicionar ativo
      </button>
    );
  }
  return (
    <div className="mt-1 space-y-1">
      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); submit(); }
          if (e.key === "Escape") setEditing(false);
        }}
        placeholder="Nome do ativo..."
        className="text-xs"
      />
      {error && <p className="text-[11px] text-red-400">{error}</p>}
      <div className="flex gap-1">
        <Button size="sm" disabled={pending || !title.trim()} onClick={submit}>{pending ? "..." : "Criar"}</Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button>
      </div>
    </div>
  );
}
