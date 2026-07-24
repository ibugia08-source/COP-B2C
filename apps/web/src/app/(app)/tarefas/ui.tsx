"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { useActionState } from "react";
import { PRIORITY_META, TASK_TYPE_META, TONE_CLASSES, type Tone } from "@/lib/labels";
import { formatDateOnly } from "@/lib/date";
import { Alert, Button, Field, Input, Select, StatusBadge, Textarea, UserAvatar } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlay";
import { Icon } from "@/components/ui/icon";
import { useBoardPan } from "@/components/use-board-pan";
import { CardTrash, SelectCircle } from "@/components/bulk-select";
import { changeTaskStatus, createTask, deleteTask, quickCreateTask, reorderTaskOnBoard, type ActionState } from "./actions";

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
        // Antes navegava para /tarefas/[id] — era a "segunda aba" onde se
        // escolhia o andamento. A tarefa já nasce completa (status incluso),
        // então só fechamos e atualizamos a lista no lugar.
        setOpen(false);
        router.refresh();
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
  tags: string[];
  dueDate: string | null;
  overdue: boolean;
};

function KanbanQuickAdd({
  status,
  clientId,
  users,
  clients,
  tagOptions,
}: {
  status: string;
  clientId?: string;
  users: { id: string; name: string; avatar?: string | null }[];
  clients: { id: string; name: string }[];
  tagOptions: string[];
}) {
  const router = useRouter();
  const titleRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [priority, setPriority] = useState("");
  const [clientSel, setClientSel] = useState(clientId ?? "");
  const [tagsText, setTagsText] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setTitle("");
    setAssignedToId("");
    setPriority("");
    setClientSel(clientId ?? "");
    setTagsText("");
    setDueDate("");
    setError(null);
    setConfirmDiscard(false);
    setEditing(false);
  }

  function submit() {
    if (pending) return; // §15: evita duplicar com cliques repetidos
    if (!title.trim()) {
      setError("Informe o nome da tarefa.");
      titleRef.current?.focus();
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await quickCreateTask(title, status, clientSel || null, {
        assignedToId: assignedToId || null,
        priority: priority || null,
        tags: tagsText.split(",").map((t) => t.trim()).filter(Boolean),
        dueDate: dueDate || null,
      });
      // §15: em caso de erro mantém os dados preenchidos para nova tentativa
      if (result.error) setError(result.error);
      else {
        reset();
        router.refresh(); // atualiza card/contador sem recarregar a página
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
  const filled = !!(title.trim() || assignedToId || priority || dueDate || tagsText.trim() || clientSel);

  function tryClose() {
    // §18: sem dados fecha direto; com dados pede confirmação antes de descartar
    if (!filled) return setEditing(false);
    setConfirmDiscard(true);
  }

  return (
    <div
      className="mt-1 rounded-lg border-2 border-emerald-600 bg-zinc-900 p-3"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          tryClose();
        }
      }}
    >
      {/* cabeçalho: nome + Salvar (igual ao print) */}
      <div className="flex items-start justify-between gap-2">
        <input
          ref={titleRef}
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            // Enter salva, desde que o foco não esteja num seletor aberto
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Nome da tarefa..."
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
        <QuickRow icon="user">
          <QuickPicker
            value={assignedToId}
            onChange={setAssignedToId}
            placeholder="Adicionar responsável"
            searchable={users.length > 6}
            options={users.map((u) => ({ value: u.id, label: u.name, avatar: u.avatar ?? null }))}
            emptyText="Nenhum usuário encontrado"
          />
        </QuickRow>

        <QuickRow icon="alert">
          <QuickPicker
            value={priority}
            onChange={setPriority}
            placeholder="Adicionar prioridade"
            options={Object.entries(PRIORITY_META).map(([v, m]) => ({ value: v, label: m.label }))}
          />
        </QuickRow>

        <QuickRow icon="clients">
          {/* muitos clientes: busca por digitação OU clique na lista */}
          <QuickPicker
            value={clientSel}
            onChange={setClientSel}
            placeholder="Adicionar cliente"
            searchable
            options={clients.map((c) => ({ value: c.id, label: c.name }))}
            emptyText="Nenhum cliente encontrado"
          />
        </QuickRow>

        <QuickRow icon="pin">
          <input
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            list="quick-task-tags"
            placeholder="Adicionar tag"
            className="w-full bg-transparent text-[11px] text-zinc-300 outline-none placeholder:text-zinc-500"
          />
          <datalist id="quick-task-tags">
            {tagOptions.map((t) => <option key={t} value={t} />)}
          </datalist>
        </QuickRow>

        <QuickRow icon="calendar">
          <input
            type="date"
            min="2000-01-01"
            max="2100-12-31"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={`w-full bg-transparent text-[11px] outline-none ${dueDate ? "text-zinc-300" : "text-zinc-500"}`}
          />
        </QuickRow>

      </div>

      {error && <p className="mt-2 text-[11px] text-red-400">{error}</p>}

      {confirmDiscard ? (
        <div className="mt-2 rounded-md border border-amber-800 bg-amber-950/40 p-2">
          <p className="text-[11px] text-amber-200">Deseja descartar esta nova tarefa?</p>
          <div className="mt-1.5 flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => setConfirmDiscard(false)}>Continuar preenchendo</Button>
            <Button size="sm" variant="secondary" onClick={reset}>Descartar</Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={tryClose}
          className="mt-2 text-[11px] text-zinc-500 transition hover:text-zinc-300"
        >
          Cancelar
        </button>
      )}
    </div>
  );
}

/** Linha do card de criação: ícone + controle, como no print. */
function QuickRow({ icon, children }: { icon: React.ComponentProps<typeof Icon>["name"]; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded px-1 py-1 transition hover:bg-zinc-800/50">
      <span className="w-3.5 shrink-0 text-center text-[11px] text-zinc-500">
        <Icon name={icon} />
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

export type PickerOption = { value: string; label: string; avatar?: string | null };

/**
 * Seletor das linhas do card: busca por digitação + clique na lista, com foto
 * quando existir.
 *
 * O painel é `position: fixed` ancorado no gatilho — assim NÃO é cortado pelo
 * overflow da coluna nem do quadro (§19), sem precisar de portal.
 */
function QuickPicker({
  value,
  onChange,
  options,
  placeholder,
  searchable = false,
  emptyText = "Nenhum resultado",
}: {
  value: string;
  onChange: (v: string) => void;
  options: PickerOption[];
  placeholder: string;
  searchable?: boolean;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const selected = options.find((o) => o.value === value) ?? null;
  const filtered = q.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase()))
    : options;

  useEffect(() => {
    if (!open) return;
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 220) });
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function pick(v: string) {
    onChange(v);
    setOpen(false);
    setQ("");
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 text-left text-[11px]"
      >
        {selected ? (
          <>
            {selected.avatar !== undefined && (
              <UserAvatar name={selected.label} size="sm" src={selected.avatar} />
            )}
            <span className="truncate text-zinc-200">{selected.label}</span>
          </>
        ) : (
          <span className="text-zinc-500">{placeholder}</span>
        )}
      </button>

      {open && pos && (
        <div
          ref={panelRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 60 }}
          className="max-h-64 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 p-1 shadow-xl"
        >
          {searchable && (
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar..."
              className="mb-1 w-full rounded-md bg-zinc-800 px-2 py-1.5 text-[11px] text-zinc-200 outline-none placeholder:text-zinc-500"
            />
          )}
          {value && (
            <button
              type="button"
              onClick={() => pick("")}
              className="block w-full rounded-md px-2 py-1.5 text-left text-[11px] text-zinc-500 hover:bg-zinc-800"
            >
              Limpar seleção
            </button>
          )}
          {filtered.length === 0 ? (
            <p className="px-2 py-2 text-[11px] text-zinc-500">{emptyText}</p>
          ) : (
            filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => pick(o.value)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] text-zinc-200 hover:bg-zinc-800"
              >
                {o.avatar !== undefined && <UserAvatar name={o.label} size="sm" src={o.avatar} />}
                <span className="truncate">{o.label}</span>
              </button>
            ))
          )}
        </div>
      )}
    </>
  );
}

export function TasksKanban({
  items,
  columns,
  canUpdate,
  canCreate,
  canDelete,
  quickAddClientId,
  users = [],
  clients = [],
  tagOptions = [],
}: {
  items: KanbanTask[];
  columns: Option[];
  canUpdate: boolean;
  canCreate: boolean;
  canDelete?: boolean;
  quickAddClientId?: string;
  /** dados dos seletores do card de criação (vêm da página) */
  users?: { id: string; name: string; avatar?: string | null }[];
  clients?: { id: string; name: string }[];
  tagOptions?: string[];
}) {
  const router = useRouter();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  // card sob o cursor: abre espaço acima dele (indicador de onde vai inserir)
  const [overCardId, setOverCardId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { ref: boardRef, panProps } = useBoardPan<HTMLDivElement>();

  // tarefas cujo status não corresponde a nenhuma coluna ativa (ex.: coluna desativada)
  const known = new Set(columns.map((c) => c.value));
  const orphans = items.filter((t) => !known.has(t.status));
  const allColumns: Option[] = orphans.length
    ? [...columns, { value: "__outros__", label: "Sem coluna", color: "zinc" }]
    : columns;

  function runAction(fn: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  // troca de coluna (muda o status, com as regras de negócio da action)
  function doMove(taskId: string, status: string) {
    runAction(() => changeTaskStatus(taskId, status));
  }
  // reordena dentro da mesma coluna (só posição; não passa pelas regras de status)
  function doReorder(taskId: string, beforeTaskId: string | null) {
    runAction(() => reorderTaskOnBoard(taskId, beforeTaskId));
  }

  // soltar na ÁREA da coluna: mesma coluna = manda para o fim; outra = troca status
  function onDrop(status: string) {
    setOverCol(null);
    setOverCardId(null);
    const draggedId = dragId;
    setDragId(null);
    if (!draggedId || !canUpdate || status === "__outros__") return;
    const task = items.find((t) => t.id === draggedId);
    if (!task) return;
    if (task.status === status) doReorder(draggedId, null);
    else doMove(draggedId, status);
  }

  // soltar SOBRE um card: mesma coluna = insere antes dele; outra = troca status
  function onDropCard(targetId: string, targetStatus: string) {
    setOverCol(null);
    setOverCardId(null);
    const draggedId = dragId;
    setDragId(null);
    if (!draggedId || !canUpdate || draggedId === targetId || targetStatus === "__outros__") return;
    const dragged = items.find((t) => t.id === draggedId);
    if (!dragged) return;
    if (dragged.status === targetStatus) doReorder(draggedId, targetId);
    else doMove(draggedId, targetStatus);
  }

  return (
    <div>
      {error && <div className="mb-3"><Alert>{error}</Alert></div>}
      <div
        ref={boardRef}
        {...panProps}
        className={`flex cursor-grab gap-3 overflow-x-auto pb-4 active:cursor-grabbing ${isPending ? "opacity-70" : ""}`}
      >
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
              onDragLeave={() => {
                setOverCol((c) => (c === col.value ? null : c));
                setOverCardId(null);
              }}
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
              <div className="flex flex-col gap-2 p-2 pr-1">
                <div className="kanban-scroll flex max-h-[32rem] flex-col gap-2 overflow-y-scroll">
                {columnTasks.length === 0 && (
                  <p className="py-3 text-center text-[11px] text-zinc-600">vazio</p>
                )}
                {columnTasks.map((t) => (
                  <div
                    key={t.id}
                    draggable={canUpdate}
                    onDragStart={() => setDragId(t.id)}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverCardId(null);
                    }}
                    onDragOver={(e) => {
                      if (!canUpdate || !dragId || dragId === t.id) return;
                      // impede que a coluna trate o evento (senão iria para o fim)
                      e.preventDefault();
                      e.stopPropagation();
                      setOverCardId(t.id);
                    }}
                    onDragLeave={() => setOverCardId((c) => (c === t.id ? null : c))}
                    onDrop={(e) => {
                      e.stopPropagation();
                      onDropCard(t.id, col.value);
                    }}
                    className={`group relative rounded-lg border border-zinc-800 bg-zinc-900 p-3 transition-all duration-150 hover:border-zinc-600 ${
                      canUpdate ? "cursor-grab active:cursor-grabbing" : ""
                    } ${dragId === t.id ? "scale-[0.98] opacity-40" : ""} ${
                      overCardId === t.id && dragId !== t.id
                        ? "mt-8 border-t-2 border-t-emerald-500"
                        : ""
                    }`}
                  >
                    {/* seleção em massa e lixeira só no hover: não poluem o card */}
                    <div className="pointer-events-none absolute right-2 top-2 flex items-center gap-1.5 opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100">
                      <SelectCircle id={t.id} />
                      {canDelete && <CardTrash id={t.id} deleteAction={deleteTask} label="tarefa" />}
                    </div>

                    <Link href={`/tarefas/${t.id}`} className="block pr-12 text-sm font-medium leading-tight text-zinc-100 hover:text-emerald-300">
                      {t.title}
                    </Link>

                    {t.clientName && (
                      <p className="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-400" title={t.clientName}>
                        <Icon name="clients" /> <span className="truncate">{t.clientName}</span>
                      </p>
                    )}

                    {t.tags.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        {t.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className="rounded bg-emerald-950/60 px-1.5 py-0.5 text-[10px] text-emerald-300">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5">
                        {t.assignee && <UserAvatar name={t.assignee} size="sm" src={t.assigneeAvatar} />}
                        <StatusBadge value={t.priority} meta={PRIORITY_META} />
                      </span>
                      {t.dueDate && (
                        <span className={`flex shrink-0 items-center gap-1 text-[11px] ${t.overdue ? "text-red-400" : "text-zinc-500"}`}>
                          <Icon name="calendar" /> {formatDateOnly(t.dueDate)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                </div>
                {canCreate && col.value !== "__outros__" && col.value !== "CANCELADA" && (
                  <KanbanQuickAdd
                    status={col.value}
                    clientId={quickAddClientId}
                    users={users}
                    clients={clients}
                    tagOptions={tagOptions}
                  />
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
