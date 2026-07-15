"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ACTION_STATUS_META, ACTION_TYPE_LABELS, SUGGESTION_TYPE_LABELS } from "@/lib/copilot/labels";
import { PRIORITY_META } from "@/lib/labels";
import { Alert, Badge, Button, Field, StatusBadge, Textarea } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/overlay";
import {
  approveAndExecuteAction,
  approveSuggestion,
  cancelCopilotAction,
  rejectSuggestion,
  suggestionToTask,
  updateActionText,
  type ActionState,
} from "./actions";

export type ActionView = {
  id: string;
  actionType: string;
  status: string;
  summary: string; // descrição humana do que será feito
  editableText: string | null; // texto editável do payload (mensagem/comentário/descrição)
  errorMessage: string | null;
  resultSummary: string | null;
  resultRef: string | null;
};

export type SuggestionView = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  suggestedAction: string;
  priority: string;
  status: string;
  aiReasoningSummary: string | null;
  clientId: string | null;
  clientName: string | null;
  taskId: string | null;
  executedTaskId: string | null;
  createdAt: string; // ISO
  actions: ActionView[];
};

function useAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const run = (fn: () => Promise<ActionState>, onOk?: (r: ActionState) => void) => {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
      else {
        setNotice(result.success ?? null);
        onOk?.(result);
        router.refresh();
      }
    });
  };
  return { pending, error, notice, run };
}

/** Bloco de ação estruturada: revisar → editar → aprovar e executar → resultado/erro. */
function ActionBlock({ action: a }: { action: ActionView }) {
  const { pending, error, notice, run } = useAction();
  const [editOpen, setEditOpen] = useState(false);
  const [text, setText] = useState(a.editableText ?? "");
  const canDecide = ["PENDENTE", "APROVADA", "FALHOU"].includes(a.status);

  return (
    <div className="mt-2 rounded-lg border border-emerald-900/50 bg-emerald-950/10 p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase text-emerald-300">
          <Icon name="settings" /> {ACTION_TYPE_LABELS[a.actionType] ?? a.actionType}
        </span>
        <StatusBadge value={a.status} meta={ACTION_STATUS_META} />
      </div>
      <p className="mt-1 text-sm text-zinc-200">{a.summary}</p>
      {a.editableText != null && a.status !== "EXECUTADA" && a.status !== "CANCELADA" && (
        <pre className="mt-1.5 whitespace-pre-wrap rounded bg-zinc-950/60 p-2 font-sans text-xs text-zinc-300">{a.editableText}</pre>
      )}

      {a.status === "FALHOU" && a.errorMessage && (
        <div className="mt-2"><Alert>{a.errorMessage}</Alert></div>
      )}
      {a.status === "EXECUTADA" && (
        <p className="mt-1.5 text-xs text-emerald-400">
          <Icon name="check" /> {a.resultSummary ?? "Executada."}{" "}
          {a.resultRef && (
            <Link href={a.resultRef} className="underline hover:text-emerald-300">ver resultado →</Link>
          )}
        </p>
      )}

      {canDecide && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Button size="sm" disabled={pending} onClick={() => run(() => approveAndExecuteAction(a.id))}>
            {pending ? (
              "Executando..."
            ) : a.status === "FALHOU" ? (
              <><Icon name="retry" /> Tentar novamente</>
            ) : (
              <><Icon name="check" /> Aprovar e executar</>
            )}
          </Button>
          {a.editableText != null && (
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => { setText(a.editableText ?? ""); setEditOpen(true); }}>
              Editar
            </Button>
          )}
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => cancelCopilotAction(a.id))}>
            Cancelar ação
          </Button>
        </div>
      )}

      {notice && <div className="mt-2"><Alert tone="green">{notice}</Alert></div>}
      {error && <div className="mt-2"><Alert>{error}</Alert></div>}

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={`Editar — ${ACTION_TYPE_LABELS[a.actionType] ?? a.actionType}`}>
        <div className="space-y-4">
          <Field label="Texto (revise antes de aprovar)">
            <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-32" />
          </Field>
          {error && <Alert>{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button
              disabled={pending || text.trim().length < 3}
              onClick={() => run(() => updateActionText(a.id, text), () => setEditOpen(false))}
            >
              {pending ? "Salvando..." : "Salvar edição"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/** Card de sugestão com fluxo de aprovação: aprovar / rejeitar / editar / virar tarefa. */
export function SuggestionCard({ suggestion: s, readOnly }: { suggestion: SuggestionView; readOnly?: boolean }) {
  const { pending, error, notice, run } = useAction();
  const [editOpen, setEditOpen] = useState(false);
  const [editedAction, setEditedAction] = useState(s.suggestedAction);
  const isPending = s.status === "PENDENTE";
  const isApproved = s.status === "APROVADA";

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-100">{s.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge tone="purple">{SUGGESTION_TYPE_LABELS[s.type] ?? s.type}</Badge>
            <StatusBadge value={s.priority} meta={PRIORITY_META} />
            {s.clientName && s.clientId && (
              <Link href={`/clientes/${s.clientId}`} className="text-xs text-emerald-400 hover:underline">
                {s.clientName}
              </Link>
            )}
            {s.taskId && (
              <Link href={`/tarefas/${s.taskId}`} className="text-xs text-emerald-400 hover:underline">
                ver tarefa →
              </Link>
            )}
          </div>
        </div>
        <span className="text-[11px] text-zinc-500">
          {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(s.createdAt))}
        </span>
      </div>

      {s.description && <p className="mt-2 text-xs text-zinc-400">{s.description}</p>}

      <div className="mt-2 rounded-lg border border-zinc-800 bg-zinc-950/40 p-2.5">
        <p className="text-[11px] font-semibold uppercase text-zinc-500">Ação recomendada</p>
        <p className="mt-0.5 whitespace-pre-wrap text-sm text-zinc-200">{s.suggestedAction}</p>
      </div>

      {s.aiReasoningSummary && (
        <p className="mt-2 text-[11px] text-zinc-500">
          <span className="font-semibold">Por quê:</span> {s.aiReasoningSummary}
        </p>
      )}

      {/* Ações estruturadas: o que será executado no sistema após aprovação */}
      {!readOnly && s.actions.map((a) => <ActionBlock key={a.id} action={a} />)}

      {!readOnly && (isPending || isApproved) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {isPending && (
            <>
              <Button size="sm" variant={s.actions.length ? "secondary" : "primary"} disabled={pending} onClick={() => run(() => approveSuggestion(s.id))}>
                <Icon name="check" /> Aprovar
              </Button>
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => { setEditedAction(s.suggestedAction); setEditOpen(true); }}>
                Editar e aprovar
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => rejectSuggestion(s.id))}>
                <Icon name="close" /> Rejeitar
              </Button>
            </>
          )}
          {s.actions.length === 0 && (
            <Button size="sm" variant={isApproved ? "primary" : "secondary"} disabled={pending} onClick={() => run(() => suggestionToTask(s.id))}>
              <Icon name="tasks" /> Transformar em tarefa
            </Button>
          )}
        </div>
      )}
      {s.status === "EXECUTADA" && s.executedTaskId && (
        <p className="mt-2 text-xs text-zinc-500">
          Executada como tarefa:{" "}
          <Link href={`/tarefas/${s.executedTaskId}`} className="text-emerald-400 hover:underline">abrir tarefa →</Link>
        </p>
      )}

      {notice && <div className="mt-2"><Alert tone="green">{notice}</Alert></div>}
      {error && <div className="mt-2"><Alert>{error}</Alert></div>}

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Editar ação antes de aprovar">
        <div className="space-y-4">
          <Field label="Ação recomendada (ajuste como preferir)">
            <Textarea value={editedAction} onChange={(e) => setEditedAction(e.target.value)} className="min-h-32" />
          </Field>
          {error && <Alert>{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button
              disabled={pending || editedAction.trim().length < 5}
              onClick={() => run(() => approveSuggestion(s.id, editedAction), () => setEditOpen(false))}
            >
              {pending ? "Salvando..." : "Aprovar com edição"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
