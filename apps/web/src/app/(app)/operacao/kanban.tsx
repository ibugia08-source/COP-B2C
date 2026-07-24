"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { ADS_META, AGENCY_BRAND_META, BUSINESS_MODEL_LABEL, HEALTH_META, TONE_CLASSES, type Tone } from "@/lib/labels";
import { formatDateOnly, isDateOnlyOverdue, todayDateOnly } from "@/lib/date";
import { Alert, Badge, Button, Field, Input, StatusBadge, Textarea } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlay";
import { useBoardPan } from "@/components/use-board-pan";
import { QuickPicker } from "@/components/ui/quick-picker";
import { PersonRow } from "@/components/ui/person-row";
import { AGENCY_BRANDS, BUSINESS_MODELS, HEALTH_STATUSES } from "@/db/schema";
import { Icon } from "@/components/ui/icon";
import { CardTrash, ColumnSelectAll, SelectCircle } from "@/components/bulk-select";
import { MoveMenu } from "@/components/ui/move-menu";
import {
  deleteClient,
  moveClientStage,
  quickCreateClient,
  reorderClientOnBoard,
  setClientResponsible,
  type ResponsibleRole,
} from "./actions";

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
  gestor1Id: string | null;
  gestor1Avatar?: string | null;
  gestor2: string | null;
  gestor2Id: string | null;
  gestor2Avatar?: string | null;
  estrategista: string | null;
  estrategistaId: string | null;
  estrategistaAvatar?: string | null;
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
  canUpdate = false,
  users = [],
}: {
  clients: KanbanClient[];
  columns: StageOption[];
  canMove: boolean;
  canCreate: boolean;
  canDelete?: boolean;
  /** permite editar estrategista/G1/G2 clicando na pessoa (clients.update) */
  canUpdate?: boolean;
  /** usuários para os seletores do card de criação */
  users?: { id: string; name: string; avatar?: string | null }[];
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
                  <ColumnSelectAll ids={stageClients.map((c) => c.id)} />
                  <span className={`inline-block h-2 w-2 rounded-full border ${TONE_CLASSES[col.color]}`} />
                  {col.label}
                </span>
                <span className="rounded-full bg-zinc-800 px-1.5 text-[10px] text-zinc-400">
                  {stageClients.length}
                </span>
              </div>
              <div className="flex flex-col gap-2 p-2 pr-1">
                <div className="kanban-scroll flex max-h-[32rem] flex-col gap-2 overflow-y-scroll">
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
                    className={`group relative rounded-lg border border-zinc-800 bg-zinc-900 p-3 shadow-sm transition hover:border-zinc-600 ${
                      canMove ? "cursor-grab active:cursor-grabbing" : ""
                    } ${dragId === c.id ? "opacity-50" : ""} ${
                      dragId && dragId !== c.id ? "hover:border-emerald-500" : ""
                    }`}
                  >
                    {/* ações só no hover: não competem com o conteúdo */}
                    <div className="pointer-events-none absolute right-2 top-2 flex items-center gap-0.5 opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100">
                      <SelectCircle id={c.id} />
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

                    {/* 1. identificação */}
                    <Link
                      href={`/clientes/${c.id}`}
                      className="block pr-16 text-sm font-medium leading-tight text-zinc-100 hover:text-emerald-300"
                    >
                      {c.name}
                    </Link>
                    {c.niche && <p className="mt-0.5 text-[11px] text-zinc-500">{c.niche}</p>}

                    {/* 2. situação */}
                    <div className="mt-2 flex flex-wrap gap-1">
                      <StatusBadge value={c.agencyBrand} meta={AGENCY_BRAND_META} />
                      <StatusBadge value={c.healthStatus} meta={HEALTH_META} />
                      <StatusBadge value={c.adsStatus} meta={ADS_META} />
                    </div>

                    {/* 3. prazo e pendências */}
                    {(c.nextDue || c.pendencias.length > 0) && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                        {c.nextDue && (
                          <span
                            title="Próximo prazo"
                            className={isDateOnlyOverdue(c.nextDue) ? "text-red-400" : "text-zinc-500"}
                          >
                            <Icon name="clock" /> {formatDateOnly(c.nextDue)}
                          </span>
                        )}
                        {c.pendencias.length > 0 && (
                          <Badge tone="amber">
                            <Icon name="warning" /> {c.pendencias.length} pendência{c.pendencias.length > 1 ? "s" : ""}
                          </Badge>
                        )}
                      </div>
                    )}

                    {/* 4. pessoas por último — com clients.update, clicar edita */}
                    {canUpdate ? (
                      <div className="mt-2 space-y-1 border-t border-zinc-800 pt-2">
                        <PersonEdit
                          icon={<Icon name="brain" />}
                          role="estrategista"
                          client={c}
                          value={c.estrategistaId}
                          label={c.estrategista}
                          placeholder="Adicionar estrategista"
                          users={users}
                          onChanged={() => router.refresh()}
                          onError={setError}
                        />
                        <PersonEdit
                          icon={<span className="text-[9px] font-semibold">G1</span>}
                          role="gestor1"
                          client={c}
                          value={c.gestor1Id}
                          label={c.gestor1}
                          placeholder="Adicionar gestor 1"
                          users={users}
                          onChanged={() => router.refresh()}
                          onError={setError}
                        />
                        <PersonEdit
                          icon={<span className="text-[9px] font-semibold">G2</span>}
                          role="gestor2"
                          client={c}
                          value={c.gestor2Id}
                          label={c.gestor2}
                          placeholder="Adicionar gestor 2"
                          users={users}
                          onChanged={() => router.refresh()}
                          onError={setError}
                        />
                      </div>
                    ) : (c.estrategista || c.gestor1 || c.gestor2) ? (
                      <div className="mt-2 space-y-1 border-t border-zinc-800 pt-2">
                        {c.estrategista && (
                          <PersonRow icon={<Icon name="brain" />} name={c.estrategista} avatar={c.estrategistaAvatar} title={`Estrategista: ${c.estrategista}`} />
                        )}
                        {c.gestor1 && (
                          <PersonRow icon={<span className="text-[9px] font-semibold">G1</span>} name={c.gestor1} avatar={c.gestor1Avatar} title={`Gestor 1: ${c.gestor1}`} />
                        )}
                        {c.gestor2 && (
                          <PersonRow icon={<span className="text-[9px] font-semibold">G2</span>} name={c.gestor2} avatar={c.gestor2Avatar} title={`Gestor 2: ${c.gestor2}`} />
                        )}
                      </div>
                    ) : null}
                  </div>
                ))}
                </div>
                {canCreate && col.value !== "__outros__" && (
                  <ClientQuickAdd stage={col.value} users={users} />
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


// ---------------------------------------------------------------------------
// Card de criação rápida de cliente (inline na coluna)
// ---------------------------------------------------------------------------

/** Linha do card: ícone + controle. */
function QuickRow({
  icon,
  children,
}: {
  icon: React.ComponentProps<typeof Icon>["name"];
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 rounded px-1 py-1 transition hover:bg-zinc-800/50">
      <span className="w-3.5 shrink-0 text-center text-[11px] text-zinc-500">
        <Icon name={icon} />
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

/**
 * Cria um cliente direto na coluna, sem sair para /clientes/novo (que segue
 * existindo para o cadastro completo). Traz os campos obrigatórios do cliente
 * (nome, empresa, modelo) + saúde e os três responsáveis.
 */
function ClientQuickAdd({
  stage,
  users,
}: {
  stage: string;
  users: { id: string; name: string; avatar?: string | null }[];
}) {
  const router = useRouter();
  const nameRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [agencyBrand, setAgencyBrand] = useState("B2C_GESTAO");
  const [businessModel, setBusinessModel] = useState("OUTROS");
  const [healthStatus, setHealthStatus] = useState("ESTAVEL");
  const [strategistId, setStrategistId] = useState("");
  const [tm1, setTm1] = useState("");
  const [tm2, setTm2] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const userOpts = users.map((u) => ({ value: u.id, label: u.name, avatar: u.avatar ?? null }));
  const filled = !!(name.trim() || strategistId || tm1 || tm2);

  function reset() {
    setName("");
    setStrategistId("");
    setTm1("");
    setTm2("");
    setHealthStatus("ESTAVEL");
    setError(null);
    setConfirmDiscard(false);
    setEditing(false);
  }

  function submit() {
    if (pending) return;
    if (!name.trim()) {
      setError("Informe o nome do cliente.");
      nameRef.current?.focus();
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await quickCreateClient({
        name,
        pipelineStage: stage,
        agencyBrand,
        businessModel,
        healthStatus,
        strategistId: strategistId || null,
        trafficManager1Id: tm1 || null,
        trafficManager2Id: tm2 || null,
      });
      if (r.error) setError(r.error);
      else {
        reset();
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
        + Adicionar cliente
      </button>
    );
  }

  return (
    <div
      className="mt-1 rounded-lg border-2 border-emerald-600 bg-zinc-900 p-3"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          if (!filled) reset();
          else setConfirmDiscard(true);
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <input
          ref={nameRef}
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Nome do cliente..."
          className="min-w-0 flex-1 bg-transparent text-sm font-medium text-zinc-100 outline-none placeholder:text-zinc-500"
        />
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="shrink-0 rounded-md bg-emerald-700 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-emerald-600 disabled:opacity-50"
        >
          {pending ? "Salvando…" : "Salvar ⏎"}
        </button>
      </div>

      <div className="mt-2 space-y-0.5">
        <QuickRow icon="clients">
          <QuickPicker
            value={agencyBrand}
            onChange={setAgencyBrand}
            placeholder="Empresa / marca"
            options={AGENCY_BRANDS.map((v) => ({ value: v, label: AGENCY_BRAND_META[v]?.label ?? v }))}
          />
        </QuickRow>
        <QuickRow icon="chart">
          <QuickPicker
            value={businessModel}
            onChange={setBusinessModel}
            placeholder="Modelo de negócio"
            options={BUSINESS_MODELS.map((v) => ({ value: v, label: BUSINESS_MODEL_LABEL[v] ?? v }))}
          />
        </QuickRow>
        <QuickRow icon="heart">
          <QuickPicker
            value={healthStatus}
            onChange={setHealthStatus}
            placeholder="Saúde da conta"
            options={HEALTH_STATUSES.map((v) => ({ value: v, label: HEALTH_META[v]?.label ?? v }))}
          />
        </QuickRow>
        <QuickRow icon="brain">
          <QuickPicker
            value={strategistId}
            onChange={setStrategistId}
            placeholder="Adicionar estrategista"
            searchable={users.length > 6}
            options={userOpts}
            emptyText="Nenhum usuário encontrado"
          />
        </QuickRow>
        <QuickRow icon="user">
          <QuickPicker
            value={tm1}
            onChange={setTm1}
            placeholder="Adicionar gestor 1"
            searchable={users.length > 6}
            options={userOpts}
            emptyText="Nenhum usuário encontrado"
          />
        </QuickRow>
        <QuickRow icon="user">
          <QuickPicker
            value={tm2}
            onChange={setTm2}
            placeholder="Adicionar gestor 2"
            searchable={users.length > 6}
            options={userOpts}
            emptyText="Nenhum usuário encontrado"
          />
        </QuickRow>
      </div>

      {error && <p className="mt-2 text-[11px] text-red-400">{error}</p>}

      {confirmDiscard ? (
        <div className="mt-2 rounded-md border border-amber-800 bg-amber-950/40 p-2">
          <p className="text-[11px] text-amber-200">Deseja descartar este novo cliente?</p>
          <div className="mt-1.5 flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => setConfirmDiscard(false)}>Continuar preenchendo</Button>
            <Button size="sm" variant="secondary" onClick={reset}>Descartar</Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => (filled ? setConfirmDiscard(true) : reset())}
          className="mt-2 text-[11px] text-zinc-500 transition hover:text-zinc-300"
        >
          Cancelar
        </button>
      )}
    </div>
  );
}

/**
 * Linha de pessoa EDITÁVEL do card: clicar abre o seletor (busca + foto) e a
 * escolha grava na hora via setClientResponsible. "Limpar seleção" remove.
 */
function PersonEdit({
  icon,
  role,
  client,
  value,
  label,
  placeholder,
  users,
  onChanged,
  onError,
}: {
  icon: React.ReactNode;
  role: ResponsibleRole;
  client: KanbanClient;
  value: string | null;
  label: string | null;
  placeholder: string;
  users: { id: string; name: string; avatar?: string | null }[];
  onChanged: () => void;
  onError: (msg: string | null) => void;
}) {
  const [pending, startTransition] = useTransition();

  function change(userId: string) {
    if ((userId || null) === value) return;
    onError(null);
    startTransition(async () => {
      const r = await setClientResponsible(client.id, role, userId || null);
      if (r.error) onError(r.error);
      else onChanged();
    });
  }

  return (
    <div
      className={`flex items-center gap-1.5 text-[11px] ${pending ? "opacity-50" : ""}`}
      title={label ? `${placeholder.replace("Adicionar ", "")}: ${label} — clique para trocar` : placeholder}
      // impede que o clique/arraste no seletor vire drag do card
      draggable={false}
      onDragStart={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span className="flex w-4 shrink-0 justify-center text-zinc-500">{icon}</span>
      <span className="min-w-0 flex-1">
        <QuickPicker
          value={value ?? ""}
          onChange={change}
          placeholder={placeholder}
          searchable={users.length > 6}
          options={users.map((u) => ({ value: u.id, label: u.name, avatar: u.avatar ?? null }))}
          emptyText="Nenhum usuário encontrado"
        />
      </span>
    </div>
  );
}
