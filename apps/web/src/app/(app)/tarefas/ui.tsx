"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { useActionState } from "react";
import { TASK_STATUSES, type TaskStatus } from "@/db/schema";
import { formatDate, PRIORITY_META, TASK_STATUS_META, TASK_TYPE_META } from "@/lib/labels";
import { Alert, Badge, Button, Field, Input, Select, StatusBadge, Textarea, UserAvatar } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlay";
import { changeTaskStatus, createTask, type ActionState } from "./actions";

const selectClass =
  "rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:border-emerald-600";

// ---------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------

export function TaskFilters({
  users,
  clients,
  tags,
}: {
  users: { id: string; name: string }[];
  clients: { id: string; name: string }[];
  tags: string[];
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

  return (
    <div className={`mb-4 flex flex-wrap gap-2 ${pending ? "opacity-60" : ""}`}>
      <select className={selectClass} value={sel("cliente")} onChange={(e) => setParam("cliente", e.target.value)}>
        <option value="">Cliente: todos</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <select className={selectClass} value={sel("responsavel")} onChange={(e) => setParam("responsavel", e.target.value)}>
        <option value="">Responsável: todos</option>
        <option value="__none__">Sem responsável</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>{u.name}</option>
        ))}
      </select>
      <select className={selectClass} value={sel("tipo")} onChange={(e) => setParam("tipo", e.target.value)}>
        <option value="">Tipo: todos</option>
        {Object.entries(TASK_TYPE_META).map(([v, m]) => (
          <option key={v} value={v}>{m.label}</option>
        ))}
      </select>
      <select className={selectClass} value={sel("status")} onChange={(e) => setParam("status", e.target.value)}>
        <option value="">Status: todos</option>
        <option value="__abertas__">Abertas</option>
        {Object.entries(TASK_STATUS_META).map(([v, m]) => (
          <option key={v} value={v}>{m.label}</option>
        ))}
      </select>
      <select className={selectClass} value={sel("prioridade")} onChange={(e) => setParam("prioridade", e.target.value)}>
        <option value="">Prioridade: todas</option>
        {Object.entries(PRIORITY_META).map(([v, m]) => (
          <option key={v} value={v}>{m.label}</option>
        ))}
      </select>
      <select className={selectClass} value={sel("prazo")} onChange={(e) => setParam("prazo", e.target.value)}>
        <option value="">Prazo: todos</option>
        <option value="hoje">Vence hoje</option>
        <option value="semana">Vence em 7 dias</option>
        <option value="atrasadas">Atrasadas</option>
        <option value="sem">Sem prazo</option>
      </select>
      {tags.length > 0 && (
        <select className={selectClass} value={sel("tag")} onChange={(e) => setParam("tag", e.target.value)}>
          <option value="">Tag: todas</option>
          {tags.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal de criação
// ---------------------------------------------------------------------------

export function TaskCreateButton({
  users,
  clients,
  defaultClientId,
  autoOpen,
  parentTaskId,
  digitalAssetId,
  label,
}: {
  users: { id: string; name: string }[];
  clients: { id: string; name: string }[];
  defaultClientId?: string;
  autoOpen?: boolean;
  parentTaskId?: string;
  digitalAssetId?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(autoOpen ?? false);
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    async (prev, formData) => {
      const result = await createTask(prev, formData);
      if (result.taskId) {
        setOpen(false);
        router.push(`/tarefas/${result.taskId}`);
      }
      return result;
    },
    {},
  );

  return (
    <>
      <Button onClick={() => setOpen(true)} size={parentTaskId ? "sm" : "md"} variant={parentTaskId ? "secondary" : "primary"}>
        {label ?? "+ Nova tarefa"}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={parentTaskId ? "Nova subtarefa" : "Nova tarefa"} wide>
        <form action={formAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {parentTaskId && <input type="hidden" name="parentTaskId" value={parentTaskId} />}
          {digitalAssetId && <input type="hidden" name="digitalAssetId" value={digitalAssetId} />}
          <Field label="Título *" className="sm:col-span-2">
            <Input name="title" required placeholder="O que precisa ser feito?" />
          </Field>
          <Field label="Descrição" className="sm:col-span-2">
            <Textarea name="description" placeholder="Detalhes, contexto, links..." />
          </Field>
          <Field label="Tipo">
            <Select name="type" defaultValue="OPERACIONAL">
              {Object.entries(TASK_TYPE_META).map(([v, m]) => (
                <option key={v} value={v}>{m.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Prioridade">
            <Select name="priority" defaultValue="MEDIA">
              {Object.entries(PRIORITY_META).map(([v, m]) => (
                <option key={v} value={v}>{m.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Cliente (opcional)">
            <Select name="clientId" defaultValue={defaultClientId ?? ""}>
              <option value="">— Sem cliente —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Responsável principal">
            <Select name="assignedToId" defaultValue="">
              <option value="">— Sem responsável —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Outros responsáveis">
            <select
              name="extraAssigneeIds"
              multiple
              className="h-24 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Início">
              <Input name="startDate" type="date" />
            </Field>
            <Field label="Vencimento">
              <Input name="dueDate" type="date" />
            </Field>
            <Field label="Estimativa (min)">
              <Input name="estimatedMinutes" type="number" min="1" />
            </Field>
            <Field label="Tags (vírgula)">
              <Input name="tags" placeholder="relatorio, meta" />
            </Field>
          </div>

          {state.error && <div className="sm:col-span-2"><Alert>{state.error}</Alert></div>}

          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={pending}>{pending ? "Criando..." : "Criar tarefa"}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Kanban de tarefas
// ---------------------------------------------------------------------------

export type KanbanTask = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: string;
  type: string;
  clientName: string | null;
  assignee: string | null;
  dueDate: string | null;
  overdue: boolean;
};

const KANBAN_COLUMNS: TaskStatus[] = TASK_STATUSES.filter((s) => s !== "CANCELADA");

export function TasksKanban({ items, canUpdate }: { items: KanbanTask[]; canUpdate: boolean }) {
  const router = useRouter();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<TaskStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onDrop(status: TaskStatus) {
    setOverCol(null);
    if (!dragId || !canUpdate) return;
    const task = items.find((t) => t.id === dragId);
    setDragId(null);
    if (!task || task.status === status) return;
    setError(null);
    startTransition(async () => {
      const result = await changeTaskStatus(task.id, status);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div>
      {error && <div className="mb-3"><Alert>{error}</Alert></div>}
      <div className={`flex gap-3 overflow-x-auto pb-4 ${isPending ? "opacity-70" : ""}`}>
        {KANBAN_COLUMNS.map((status) => {
          const columnTasks = items.filter((t) => t.status === status);
          return (
            <div
              key={status}
              onDragOver={(e) => {
                if (canUpdate) {
                  e.preventDefault();
                  setOverCol(status);
                }
              }}
              onDragLeave={() => setOverCol((c) => (c === status ? null : c))}
              onDrop={() => onDrop(status)}
              className={`flex w-60 shrink-0 flex-col rounded-xl border bg-zinc-900/50 ${
                overCol === status ? "border-emerald-500" : "border-zinc-800"
              }`}
            >
              <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
                <span className="text-xs font-semibold text-zinc-300">
                  {TASK_STATUS_META[status]?.label}
                </span>
                <span className="rounded-full bg-zinc-800 px-1.5 text-[10px] text-zinc-400">
                  {columnTasks.length}
                </span>
              </div>
              <div className="flex min-h-24 flex-1 flex-col gap-2 p-2">
                {columnTasks.length === 0 && (
                  <p className="py-3 text-center text-[11px] text-zinc-600">vazio</p>
                )}
                {columnTasks.map((t) => (
                  <div
                    key={t.id}
                    draggable={canUpdate}
                    onDragStart={() => setDragId(t.id)}
                    onDragEnd={() => setDragId(null)}
                    className={`rounded-lg border border-zinc-800 bg-zinc-900 p-3 transition hover:border-zinc-600 ${
                      canUpdate ? "cursor-grab active:cursor-grabbing" : ""
                    } ${dragId === t.id ? "opacity-50" : ""}`}
                  >
                    <Link href={`/tarefas/${t.id}`} className="text-sm font-medium leading-tight text-zinc-100 hover:text-emerald-300">
                      {t.title}
                    </Link>
                    {t.clientName && <p className="mt-0.5 text-[11px] text-zinc-500">{t.clientName}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      <StatusBadge value={t.priority} meta={PRIORITY_META} />
                      <StatusBadge value={t.type} meta={TASK_TYPE_META} />
                      {t.overdue && <Badge tone="red">vencida</Badge>}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500">
                      <span className="flex items-center gap-1">
                        {t.assignee ? <UserAvatar name={t.assignee} size="sm" /> : <span className="text-amber-500">sem resp.</span>}
                      </span>
                      <span className={t.overdue ? "text-red-400" : ""}>
                        {t.dueDate ? formatDate(new Date(t.dueDate)) : ""}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
