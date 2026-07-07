"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { TASK_STATUSES, type TaskStatus } from "@/db/schema";
import { TASK_STATUS_META } from "@/lib/labels";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlay";
import {
  addAttachment,
  addChecklist,
  addChecklistItem,
  addComment,
  addTimeEntry,
  applyTemplateAction,
  assignTask,
  cancelTask,
  changeTaskStatus,
  toggleChecklistItem,
  type ActionState,
} from "../actions";

function useAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<ActionState>, onOk?: () => void) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
      else {
        onOk?.();
        router.refresh();
      }
    });
  };
  return { pending, error, run, setError };
}

export function TaskStatusControls({
  taskId,
  status,
  canComplete,
}: {
  taskId: string;
  status: TaskStatus;
  canComplete: boolean;
}) {
  const { pending, error, run } = useAction();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={status}
          disabled={pending}
          onChange={(e) => run(() => changeTaskStatus(taskId, e.target.value as TaskStatus))}
          className="max-w-52"
        >
          {TASK_STATUSES.filter((s) => s !== "CANCELADA").map((s) => (
            <option key={s} value={s}>{TASK_STATUS_META[s]?.label}</option>
          ))}
        </Select>
        {status !== "CONCLUIDA" && canComplete && (
          <Button size="sm" disabled={pending} onClick={() => run(() => changeTaskStatus(taskId, "CONCLUIDA"))}>
            ✓ Concluir
          </Button>
        )}
        {status !== "CANCELADA" && (
          <Button size="sm" variant="danger" disabled={pending} onClick={() => setCancelOpen(true)}>
            Cancelar tarefa
          </Button>
        )}
      </div>
      {error && <Alert>{error}</Alert>}

      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancelar tarefa">
        <div className="space-y-4">
          <Field label="Motivo do cancelamento *">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Por que esta tarefa está sendo cancelada?" />
          </Field>
          {error && <Alert>{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCancelOpen(false)}>Voltar</Button>
            <Button
              variant="danger"
              disabled={pending}
              onClick={() => run(() => cancelTask(taskId, reason), () => setCancelOpen(false))}
            >
              {pending ? "Cancelando..." : "Confirmar cancelamento"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export function AssignSelect({
  taskId,
  current,
  users,
}: {
  taskId: string;
  current: string | null;
  users: { id: string; name: string }[];
}) {
  const { pending, error, run } = useAction();
  return (
    <div>
      <Select
        value={current ?? ""}
        disabled={pending}
        onChange={(e) => run(() => assignTask(taskId, e.target.value || null))}
      >
        <option value="">— Sem responsável —</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>{u.name}</option>
        ))}
      </Select>
      {error && <div className="mt-1"><Alert>{error}</Alert></div>}
    </div>
  );
}

export function ChecklistSection({
  taskId,
  checklists,
  templates,
}: {
  taskId: string;
  checklists: {
    id: string;
    title: string;
    items: { id: string; content: string; isDone: boolean }[];
  }[];
  templates: { slug: string; name: string }[];
}) {
  const { pending, error, run } = useAction();
  const [newChecklist, setNewChecklist] = useState("");
  const [newItems, setNewItems] = useState<Record<string, string>>({});
  const [templateSlug, setTemplateSlug] = useState("");

  return (
    <div className="space-y-4">
      {checklists.map((cl) => {
        const done = cl.items.filter((i) => i.isDone).length;
        return (
          <div key={cl.id} className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">{cl.title}</p>
              <span className="text-xs text-zinc-500">{done}/{cl.items.length}</span>
            </div>
            <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-emerald-600 transition-all"
                style={{ width: cl.items.length ? `${(done / cl.items.length) * 100}%` : "0%" }}
              />
            </div>
            <ul className="space-y-1">
              {cl.items.map((item) => (
                <li key={item.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-zinc-800/60">
                    <input
                      type="checkbox"
                      checked={item.isDone}
                      disabled={pending}
                      onChange={() => run(() => toggleChecklistItem(item.id, taskId))}
                      className="accent-emerald-500"
                    />
                    <span className={item.isDone ? "text-zinc-500 line-through" : "text-zinc-200"}>
                      {item.content}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const content = newItems[cl.id] ?? "";
                if (!content.trim()) return;
                run(() => addChecklistItem(cl.id, taskId, content), () =>
                  setNewItems((s) => ({ ...s, [cl.id]: "" })),
                );
              }}
            >
              <Input
                value={newItems[cl.id] ?? ""}
                onChange={(e) => setNewItems((s) => ({ ...s, [cl.id]: e.target.value }))}
                placeholder="Novo item..."
              />
              <Button size="sm" variant="secondary" type="submit" disabled={pending}>+</Button>
            </form>
          </div>
        );
      })}

      <div className="flex flex-wrap items-end gap-2">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newChecklist.trim()) return;
            run(() => addChecklist(taskId, newChecklist), () => setNewChecklist(""));
          }}
        >
          <Input
            value={newChecklist}
            onChange={(e) => setNewChecklist(e.target.value)}
            placeholder="Título do novo checklist"
            className="w-56"
          />
          <Button size="sm" variant="secondary" type="submit" disabled={pending}>+ Checklist</Button>
        </form>
        {templates.length > 0 && (
          <div className="flex gap-2">
            <Select value={templateSlug} onChange={(e) => setTemplateSlug(e.target.value)} className="w-56">
              <option value="">Aplicar template...</option>
              {templates.map((t) => (
                <option key={t.slug} value={t.slug}>{t.name}</option>
              ))}
            </Select>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending || !templateSlug}
              onClick={() => run(() => applyTemplateAction(taskId, templateSlug), () => setTemplateSlug(""))}
            >
              Aplicar
            </Button>
          </div>
        )}
      </div>
      {error && <Alert>{error}</Alert>}
    </div>
  );
}

export function CommentForm({ taskId }: { taskId: string }) {
  const { pending, error, run } = useAction();
  const [body, setBody] = useState("");
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addComment(taskId, body), () => setBody(""));
      }}
    >
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Escreva um comentário..." />
      {error && <Alert>{error}</Alert>}
      <Button size="sm" type="submit" disabled={pending || !body.trim()}>
        {pending ? "Enviando..." : "Comentar"}
      </Button>
    </form>
  );
}

export function AttachmentForm({ taskId }: { taskId: string }) {
  const { pending, error, run } = useAction();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addAttachment(taskId, name, url), () => {
          setName("");
          setUrl("");
        });
      }}
    >
      <Field label="Nome do arquivo">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="briefing.pdf" className="w-44" />
      </Field>
      <Field label="Link (Drive, Notion...)">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." className="w-64" />
      </Field>
      <Button size="sm" variant="secondary" type="submit" disabled={pending}>+ Anexo</Button>
      {error && <Alert>{error}</Alert>}
    </form>
  );
}

export function TimeEntryForm({ taskId }: { taskId: string }) {
  const { pending, error, run } = useAction();
  const [minutes, setMinutes] = useState("");
  const [desc, setDesc] = useState("");
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addTimeEntry(taskId, Number(minutes), desc), () => {
          setMinutes("");
          setDesc("");
        });
      }}
    >
      <Field label="Minutos">
        <Input type="number" min="1" value={minutes} onChange={(e) => setMinutes(e.target.value)} className="w-24" />
      </Field>
      <Field label="Descrição (opcional)">
        <Input value={desc} onChange={(e) => setDesc(e.target.value)} className="w-56" placeholder="O que foi feito?" />
      </Field>
      <Button size="sm" variant="secondary" type="submit" disabled={pending || !minutes}>+ Tempo</Button>
      {error && <Alert>{error}</Alert>}
    </form>
  );
}
