"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { useActionState } from "react";
import { PRIORITY_META, TASK_TYPE_META, TONE_CLASSES, type Tone } from "@/lib/labels";
import { formatDateOnly } from "@/lib/date";
import { Alert, Badge, Button, Field, Input, Select, StatusBadge, Textarea, UserAvatar } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlay";
import { CardTrash, SelectCircle } from "@/components/bulk-select";
import { changeTaskStatus, createTask, deleteTask, quickCreateTask, type ActionState } from "./actions";

const selectClass =
  "rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:border-emerald-600";

export type Option = { value: string; label: string; color: Tone };

// ---------------------------------------------------------------------------
// Filtros combinados — todos os selects escrevem na URL e se acumulam
// ---------------------------------------------------------------------------

export const TASK_FILTER_KEYS = ["cliente", "responsavel", "tipo", "status", "prioridade", "prazo", "tag", "criador"] as const;

export function TaskFilters({
  users,
  clients,
  tags,
  statusOptions,
  typeOptions,
}: {
  users: { id: string; name: string }[];
  clients: { id: string; name: string }[];
  tags: string[];
  statusOptions: Option[];
  typeOptions: Option[];
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
  const hasFilters = TASK_FILTER_KEYS.some((k) => params.get(k));

  return (
    <div className={`mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-2 ${pending ? "opacity-60" : ""}`}>
      <select className={selectClass} value={sel("status")} onChange={(e) => setParam("status", e.target.value)}>
        <option value="">Status: todos</option>
        <option value="__abertas__">Abertas</option>
        {statusOptions.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <select className={selectClass} value={sel("responsavel")} onChange={(e) => setParam("responsavel", e.target.value)}>
        <option value="">Responsável: todos</option>
        <option value="__none__">Sem responsável</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>{u.name}</option>
        ))}
      </select>
      <select className={selectClass} value={sel("cliente")} onChange={(e) => setParam("cliente", e.target.value)}>
        <option value="">Cliente: todos</option>
        <option value="__none__">Sem cliente</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <select className={selectClass} value={sel("tipo")} onChange={(e) => setParam("tipo", e.target.value)}>
        <option value="">Tipo: todos</option>
        {typeOptions.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <select className={selectClass} value={sel("prioridade")} onChange={(e) => setParam("prioridade", e.target.value)}>
        <option value="">Prioridade: todas</option>
        {Object.entries(PRIORITY_META).map(([v, m]) => (
          <option key={v} value={v}>{m.label}</option>
        ))}
      </select>
      <select className={selectClass} value={sel("prazo")} onChange={(e) => setParam("prazo", e.target.value)}>
        <option value="">Vencimento: todos</option>
        <option value="hoje">Vence hoje</option>
        <option value="semana">Esta semana</option>
        <option value="atrasadas">Atrasadas</option>
        <option value="sem">Sem prazo</option>
      </select>
      <select className={selectClass} value={sel("criador")} onChange={(e) => setParam("criador", e.target.value)}>
        <option value="">Criado por: todos</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>{u.name}</option>
        ))}
      </select>
      {tags.length > 0 && (
        <select className={selectClass} value={sel("tag")} onChange={(e) => setParam("tag", e.target.value)}>
          <option value="">Tag: todas</option>
          {tags.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      )}
      {hasFilters && (
        <button
          type="button"
          onClick={() => {
            const next = new URLSearchParams(params.toString());
            for (const k of TASK_FILTER_KEYS) next.delete(k);
            startTransition(() => router.replace(`${pathname}?${next.toString()}`));
          }}
          className="rounded-lg px-2 py-1.5 text-xs text-zinc-500 hover:text-white"
        >
          Limpar filtros
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal de criação (com briefing quando o tipo é CRIATIVO)
// ---------------------------------------------------------------------------

const CREATIVE_OBJECTIVES_OPTS = ["Mensagens", "Engajamento", "Reconhecimento", "Vendas", "Leads", "Social Media"];
const CREATIVE_PLATFORM_OPTS = ["Meta Ads", "Google Ads", "Instagram", "TikTok", "Outro"];
const CREATIVE_FORMAT_OPTS = ["Vídeo", "Imagem", "Carrossel", "Stories", "Reels", "Outro"];

export function TaskCreateButton({
  users,
  clients,
  defaultClientId,
  defaultType,
  autoOpen,
  parentTaskId,
  digitalAssetId,
  label,
}: {
  users: { id: string; name: string }[];
  clients: { id: string; name: string }[];
  defaultClientId?: string;
  defaultType?: string;
  autoOpen?: boolean;
  parentTaskId?: string;
  digitalAssetId?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(autoOpen ?? false);
  const [type, setType] = useState(defaultType ?? "OPERACIONAL");
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
            <Select name="type" value={type} onChange={(e) => setType(e.target.value)}>
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

          {type === "CRIATIVO" && (
            <fieldset className="rounded-xl border border-purple-900/60 bg-purple-950/10 p-3 sm:col-span-2">
              <legend className="px-1 text-xs font-semibold uppercase text-purple-300">Briefing do criativo</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Objetivo">
                  <Select name="creativeObjective" defaultValue="">
                    <option value="">—</option>
                    {CREATIVE_OBJECTIVES_OPTS.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Plataforma">
                  <Select name="creativePlatform" defaultValue="">
                    <option value="">—</option>
                    {CREATIVE_PLATFORM_OPTS.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Formato">
                  <Select name="creativeFormat" defaultValue="">
                    <option value="">—</option>
                    {CREATIVE_FORMAT_OPTS.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Oferta">
                  <Input name="creativeOffer" placeholder="Ex.: 20% off na primeira compra" />
                </Field>
                <Field label="CTA">
                  <Input name="creativeCta" placeholder="Ex.: Fale conosco no WhatsApp" />
                </Field>
                <Field label="Link de referência">
                  <Input name="creativeReference" placeholder="https://..." />
                </Field>
              </div>
              <p className="mt-2 text-[11px] text-zinc-500">Anexos podem ser adicionados depois, dentro da tarefa.</p>
            </fieldset>
          )}

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
// Kanban de tarefas — colunas dinâmicas (config do admin) + adicionar na coluna
// ---------------------------------------------------------------------------

export type KanbanTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  type: string;
  clientName: string | null;
  assignee: string | null;
  assigneeAvatar?: string | null;
  dueDate: string | null;
  overdue: boolean;
};

function KanbanQuickAdd({ status, clientId }: { status: string; clientId?: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!title.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await quickCreateTask(title, status, clientId ?? null);
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
        + Adicionar tarefa
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
        placeholder="Título da tarefa..."
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

export function TasksKanban({
  items,
  columns,
  canUpdate,
  canCreate,
  canDelete,
  quickAddClientId,
}: {
  items: KanbanTask[];
  columns: Option[];
  canUpdate: boolean;
  canCreate: boolean;
  canDelete?: boolean;
  quickAddClientId?: string;
}) {
  const router = useRouter();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // tarefas cujo status não corresponde a nenhuma coluna ativa (ex.: coluna desativada)
  const known = new Set(columns.map((c) => c.value));
  const orphans = items.filter((t) => !known.has(t.status));
  const allColumns: Option[] = orphans.length
    ? [...columns, { value: "__outros__", label: "Sem coluna", color: "zinc" }]
    : columns;

  function onDrop(status: string) {
    setOverCol(null);
    if (!dragId || !canUpdate || status === "__outros__") return;
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
        {allColumns.map((col) => {
          const columnTasks =
            col.value === "__outros__" ? orphans : items.filter((t) => t.status === col.value);
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
              className={`flex w-60 shrink-0 flex-col rounded-xl border bg-zinc-900/50 ${
                overCol === col.value ? "border-emerald-500" : "border-zinc-800"
              }`}
            >
              <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
                  <span className={`inline-block h-2 w-2 rounded-full border ${TONE_CLASSES[col.color]}`} />
                  {col.label}
                </span>
                <span className="rounded-full bg-zinc-800 px-1.5 text-[10px] text-zinc-400">
                  {columnTasks.length}
                </span>
              </div>
              <div className="flex flex-col gap-2 p-2">
                <div className="flex max-h-[32rem] flex-col gap-2 overflow-y-auto pr-0.5">
                {columnTasks.length === 0 && (
                  <p className="py-3 text-center text-[11px] text-zinc-600">vazio</p>
                )}
                {columnTasks.map((t) => (
                  <div
                    key={t.id}
                    draggable={canUpdate}
                    onDragStart={() => setDragId(t.id)}
                    onDragEnd={() => setDragId(null)}
                    className={`group rounded-lg border border-zinc-800 bg-zinc-900 p-3 transition hover:border-zinc-600 ${
                      canUpdate ? "cursor-grab active:cursor-grabbing" : ""
                    } ${dragId === t.id ? "opacity-50" : ""}`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <SelectCircle id={t.id} />
                      {canDelete && <CardTrash id={t.id} deleteAction={deleteTask} label="tarefa" />}
                    </div>
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
                        {t.assignee ? <UserAvatar name={t.assignee} size="sm" src={t.assigneeAvatar} /> : <span className="text-amber-500">sem resp.</span>}
                      </span>
                      <span className={t.overdue ? "text-red-400" : ""}>
                        {t.dueDate ? formatDateOnly(t.dueDate) : ""}
                      </span>
                    </div>
                  </div>
                ))}
                </div>
                {canCreate && col.value !== "__outros__" && col.value !== "CANCELADA" && (
                  <KanbanQuickAdd status={col.value} clientId={quickAddClientId} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lista — ação rápida de status por linha, colunas configuráveis e quick-add
// ---------------------------------------------------------------------------

export function RowStatusSelect({
  taskId,
  status,
  options,
}: {
  taskId: string;
  status: string;
  options: Option[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <select
      className={`${selectClass} ${pending ? "opacity-50" : ""}`}
      value={status}
      disabled={pending}
      onChange={(e) =>
        startTransition(async () => {
          const result = await changeTaskStatus(taskId, e.target.value);
          if (!result.error) router.refresh();
        })
      }
    >
      {!options.some((o) => o.value === status) && <option value={status}>{status}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export function ListColumnsPicker({
  allColumns,
  visible,
}: {
  allColumns: { key: string; label: string }[];
  visible: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  function toggle(key: string) {
    const next = new URLSearchParams(params.toString());
    const set = new Set(visible);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    next.set("cols", allColumns.map((c) => c.key).filter((k) => set.has(k)).join(","));
    router.replace(`${pathname}?${next.toString()}`);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-300 hover:border-zinc-600"
      >
        Colunas ▾
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-zinc-700 bg-zinc-900 p-2 shadow-xl">
          {allColumns.map((c) => (
            <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800">
              <input type="checkbox" checked={visible.includes(c.key)} onChange={() => toggle(c.key)} />
              {c.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function ListQuickAdd({ defaultStatus, clientId }: { defaultStatus: string; clientId?: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!title.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await quickCreateTask(title, defaultStatus, clientId ?? null);
      if (result.error) setError(result.error);
      else {
        setTitle("");
        router.refresh();
      }
    });
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-zinc-800 px-3 py-2">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
        placeholder="+ Adicionar tarefa rápida..."
        className="max-w-sm text-sm"
      />
      <Button size="sm" variant="secondary" disabled={pending || !title.trim()} onClick={submit}>
        {pending ? "Criando..." : "Adicionar"}
      </Button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
