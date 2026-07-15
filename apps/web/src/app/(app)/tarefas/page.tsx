import Link from "next/link";
import { and, asc, eq, gte, isNull, lt, not, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { clientMeetings, clients, tasks, users } from "@/db/schema";
import { hasPermission, requirePermission } from "@/lib/auth/guard";
import { taskScopeCondition } from "@/lib/auth/ownership";
import { resolveOptions } from "@/lib/config-options";
import { formatDate, PRIORITY_META, TASK_STATUS_META, TASK_TYPE_META, type Tone } from "@/lib/labels";
import {
  Badge,
  EmptyState,
  PageHeader,
  StatCard,
  StatusBadge,
  Table,
  Td,
  Th,
  UserAvatar,
} from "@/components/ui/primitives";
import {
  ListColumnsPicker,
  ListQuickAdd,
  RowStatusSelect,
  TaskCreateButton,
  TaskFilters,
  TasksKanban,
  type KanbanTask,
  type Option,
} from "./ui";
import { ModuleConfig } from "../module-config";
import { Icon } from "@/components/ui/icon";
import { CalendarMonth, type CalendarItem } from "@/components/calendar-month";
import { BulkBar, CardTrash, SelectCircle, SelectionProvider, type BulkMenu } from "@/components/bulk-select";
import { bulkAssignTasks, bulkDeleteTasks, bulkMoveTasks, bulkPrioritizeTasks, deleteTask } from "./actions";

type Search = Record<string, string | string[] | undefined>;
const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

const DAY = 24 * 60 * 60 * 1000;
const FILTER_KEYS = ["cliente", "responsavel", "tipo", "status", "prioridade", "prazo", "tag", "criador"] as const;
const LIST_COLUMNS = [
  { key: "tipo", label: "Tipo" },
  { key: "status", label: "Status" },
  { key: "prioridade", label: "Prioridade" },
  { key: "cliente", label: "Cliente" },
  { key: "responsavel", label: "Responsável" },
  { key: "vencimento", label: "Vencimento" },
  { key: "tags", label: "Tags" },
  { key: "criador", label: "Criada por" },
] as const;
const DEFAULT_COLS = "tipo,status,prioridade,cliente,responsavel,vencimento";

export default async function TarefasPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requirePermission("tasks.view");
  const sp = await searchParams;
  const canUpdate = hasPermission(session, "tasks.update");
  const canCreate = hasPermission(session, "tasks.create");
  const canDelete = hasPermission(session, "tasks.delete");

  // --- filtros combinados -------------------------------------------------
  const filters: SQL[] = [isNull(tasks.parentTaskId)];
  // escopo de ownership: quem não é OWNER/ADMIN só vê tarefas suas ou de clientes que gerencia
  const scope = taskScopeCondition(session);
  if (scope) filters.push(scope);
  const cliente = str(sp.cliente);
  if (cliente === "__none__") filters.push(isNull(tasks.clientId));
  else if (cliente) filters.push(eq(tasks.clientId, cliente));
  const resp = str(sp.responsavel);
  if (resp === "__none__") filters.push(isNull(tasks.assignedToId));
  else if (resp) filters.push(eq(tasks.assignedToId, resp));
  if (str(sp.tipo)) filters.push(eq(tasks.type, str(sp.tipo) as never));
  const status = str(sp.status);
  if (status === "__abertas__") filters.push(not(inArray(tasks.status, ["CONCLUIDA", "CANCELADA"])));
  else if (status) filters.push(eq(tasks.status, status as never));
  if (str(sp.prioridade)) filters.push(eq(tasks.priority, str(sp.prioridade) as never));
  // containment jsonb (usa o índice GIN) — LIKE não existe para jsonb
  if (str(sp.tag)) filters.push(sql`${tasks.tags} @> ${JSON.stringify([str(sp.tag)])}::jsonb`);
  if (str(sp.criador)) filters.push(eq(tasks.createdById, str(sp.criador)!));

  const now = new Date();
  const prazo = str(sp.prazo);
  if (prazo === "atrasadas") {
    filters.push(lt(tasks.dueDate, now), not(inArray(tasks.status, ["CONCLUIDA", "CANCELADA"])));
  } else if (prazo === "hoje") {
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    const end = new Date(now); end.setHours(23, 59, 59, 999);
    filters.push(not(isNull(tasks.dueDate)));
    filters.push(lt(tasks.dueDate, end));
    filters.push(not(lt(tasks.dueDate, start)));
  } else if (prazo === "semana") {
    filters.push(not(isNull(tasks.dueDate)));
    filters.push(lt(tasks.dueDate, new Date(now.getTime() + 7 * DAY)));
  } else if (prazo === "sem") {
    filters.push(isNull(tasks.dueDate));
  }

  const visao = str(sp.visao) ?? "kanban";

  // mês do calendário (?mes=YYYY-MM)
  const mesParam = str(sp.mes);
  const [calYear, calMonth] = /^\d{4}-\d{2}$/.test(mesParam ?? "")
    ? [Number(mesParam!.slice(0, 4)), Number(mesParam!.slice(5, 7)) - 1]
    : [now.getFullYear(), now.getMonth()];
  const monthStart = new Date(calYear, calMonth, 1);
  const monthEnd = new Date(calYear, calMonth + 1, 1);

  const [rows, allUsers, allClients, statusOptionsAll, typeOptionsAll, counts, meetings] = await Promise.all([
    db.query.tasks.findMany({
      where: and(...filters),
      orderBy: [asc(tasks.dueDate)],
      with: { client: true, assignedTo: true, createdBy: true, subtasks: true },
      limit: 300,
    }),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.isActive, true)),
    db.select({ id: clients.id, name: clients.name }).from(clients).orderBy(asc(clients.name)),
    resolveOptions("tasks", "status"),
    resolveOptions("tasks", "type", { activeOnly: true }),
    Promise.all([
      db.$count(tasks, and(eq(tasks.assignedToId, session.userId), not(inArray(tasks.status, ["CONCLUIDA", "CANCELADA"])))),
      db.$count(tasks, and(lt(tasks.dueDate, now), not(inArray(tasks.status, ["CONCLUIDA", "CANCELADA"])))),
      db.$count(tasks, and(isNull(tasks.assignedToId), not(inArray(tasks.status, ["CONCLUIDA", "CANCELADA"])), isNull(tasks.parentTaskId))),
    ]),
    visao === "calendario"
      ? db.query.clientMeetings.findMany({
          where: and(
            gte(clientMeetings.meetingDate, monthStart),
            lt(clientMeetings.meetingDate, monthEnd),
            ...(cliente && cliente !== "__none__" ? [eq(clientMeetings.clientId, cliente)] : []),
            ...(resp && resp !== "__none__" ? [eq(clientMeetings.responsibleId, resp)] : []),
          ),
          with: { client: true },
        })
      : Promise.resolve([]),
  ]);
  const [minhas, atrasadas, semResponsavel] = counts;

  // meta de status (built-in + colunas custom do admin) para badges e selects
  const statusMeta: Record<string, { label: string; tone: Tone }> = { ...TASK_STATUS_META };
  for (const o of statusOptionsAll) statusMeta[o.value] = { label: o.label, tone: o.color };
  const statusActive = statusOptionsAll.filter((o) => o.isActive);
  const kanbanColumns: Option[] = statusActive
    .filter((o) => o.value !== "CANCELADA")
    .map((o) => ({ value: o.value, label: o.label, color: o.color }));
  const defaultStatus =
    kanbanColumns.find((c) => statusActive.find((o) => o.value === c.value)?.isDefault)?.value ??
    kanbanColumns[0]?.value ?? "A_FAZER";
  const statusFilterOptions: Option[] = statusActive.map((o) => ({ value: o.value, label: o.label, color: o.color }));
  const typeOptions: Option[] = typeOptionsAll.map((o) => ({ value: o.value, label: o.label, color: o.color }));

  const tags = Array.from(new Set(rows.flatMap((t) => t.tags))).sort();
  const kanbanItems: KanbanTask[] = rows.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    type: t.type,
    clientName: t.client?.name ?? null,
    assignee: t.assignedTo?.name ?? null,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    overdue: !!t.dueDate && !t.completedAt && t.dueDate < now && t.status !== "CONCLUIDA" && t.status !== "CANCELADA",
  }));

  // --- helpers de URL (preservam filtros ao trocar visão/ordem) ------------
  const buildHref = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && v) next.set(k, v);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    const s = next.toString();
    return s ? `/tarefas?${s}` : "/tarefas";
  };
  const activeFilterCount = FILTER_KEYS.filter((k) => str(sp[k])).length;
  const showFilters = str(sp.filtros) === "1" || activeFilterCount > 0;

  // --- ordenação e colunas da lista ----------------------------------------
  const ordem = str(sp.ordem) ?? "vencimento";
  const sorted = [...rows];
  const prioRank: Record<string, number> = { URGENTE: 0, ALTA: 1, MEDIA: 2, BAIXA: 3 };
  const statusRank = new Map(statusOptionsAll.map((o, i) => [o.value, i]));
  if (ordem === "prioridade") sorted.sort((a, b) => (prioRank[a.priority] ?? 9) - (prioRank[b.priority] ?? 9));
  else if (ordem === "titulo") sorted.sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
  else if (ordem === "status") sorted.sort((a, b) => (statusRank.get(a.status) ?? 99) - (statusRank.get(b.status) ?? 99));
  else if (ordem === "criacao") sorted.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  else sorted.sort((a, b) => (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity));

  const visibleCols = (str(sp.cols) ?? DEFAULT_COLS).split(",").filter(Boolean);
  const col = (key: string) => visibleCols.includes(key);
  const sortTh = (key: string, label: string) => (
    <Link href={buildHref({ ordem: key })} className={ordem === key ? "text-emerald-300" : "hover:text-zinc-200"}>
      {label}{ordem === key ? " ↓" : ""}
    </Link>
  );

  const bulkMenus: BulkMenu[] = [
    { label: "Mover para…", options: statusFilterOptions.filter((o) => o.value !== "CANCELADA").map((o) => ({ value: o.value, label: o.label })), run: bulkMoveTasks },
    { label: "Responsável…", options: [{ value: "", label: "— Sem responsável —" }, ...allUsers.map((u) => ({ value: u.id, label: u.name }))], run: bulkAssignTasks },
    { label: "Prioridade…", options: Object.entries(PRIORITY_META).map(([v, m]) => ({ value: v, label: m.label })), run: bulkPrioritizeTasks },
  ];

  const viewBtn = (key: string, label: string) => (
    <Link
      key={key}
      href={buildHref({ visao: key === "kanban" ? null : key })}
      className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
        visao === key ? "bg-emerald-950/70 text-emerald-300" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div>
      <PageHeader
        title="Tarefas"
        description="CRM interno de demandas — vinculadas ou não a clientes. Solicitações de criativo são tarefas do tipo Criativo."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ModuleConfig moduleKey="tasks" moduleLabel="Tarefas" buttonLabel="Colunas" />
            <Link
              href={buildHref({ filtros: showFilters && activeFilterCount === 0 ? null : "1" })}
              className={`rounded-lg border px-3 py-2 text-sm transition ${
                activeFilterCount > 0
                  ? "border-emerald-700 text-emerald-300"
                  : "border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white"
              }`}
            >
              Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </Link>
            <span className="flex items-center gap-0.5 rounded-lg border border-zinc-800 bg-zinc-900/60 p-0.5">
              {viewBtn("kanban", "Kanban")}
              {viewBtn("lista", "Lista")}
              {viewBtn("calendario", "Calendário")}
            </span>
            <Link
              href="/tarefas/templates"
              className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white"
              title="Templates de checklist"
            >
              <Icon name="clipboard" />
            </Link>
            {canCreate && (
              <TaskCreateButton
                users={allUsers}
                clients={allClients}
                defaultClientId={cliente !== "__none__" ? cliente : undefined}
                defaultType={str(sp.tipo)}
                digitalAssetId={str(sp.ativo)}
                autoOpen={str(sp.nova) === "1"}
              />
            )}
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-3 gap-3 sm:max-w-md">
        <StatCard label="Minhas abertas" value={minhas} tone="text-sky-400" href={`/tarefas?responsavel=${session.userId}&status=__abertas__`} />
        <StatCard label="Atrasadas" value={atrasadas} tone="text-red-400" href="/tarefas?prazo=atrasadas" />
        <StatCard label="Sem responsável" value={semResponsavel} tone="text-amber-400" href="/tarefas?responsavel=__none__&status=__abertas__" />
      </div>

      {showFilters && (
        <TaskFilters
          users={allUsers}
          clients={allClients}
          tags={tags}
          statusOptions={statusFilterOptions}
          typeOptions={typeOptions}
        />
      )}

      <SelectionProvider>
      {visao === "kanban" ? (
        <TasksKanban
          items={kanbanItems}
          columns={kanbanColumns}
          canUpdate={canUpdate}
          canCreate={canCreate}
          canDelete={canDelete}
          quickAddClientId={cliente !== "__none__" ? cliente : undefined}
        />
      ) : visao === "calendario" ? (
        <CalendarMonth
          year={calYear}
          month={calMonth}
          buildHref={buildHref}
          items={[
            ...sorted
              .filter((t): t is typeof t & { dueDate: Date } => !!t.dueDate)
              .map<CalendarItem>((t) => ({
                kind: "task",
                id: t.id,
                title: t.title,
                href: `/tarefas/${t.id}`,
                date: t.dueDate,
                done: t.status === "CONCLUIDA",
              })),
            ...meetings.map<CalendarItem>((m) => ({
              kind: "meeting",
              id: m.id,
              title: `${m.client?.name ?? "Cliente"} — ${m.title}`,
              href: `/clientes/${m.clientId}`,
              date: m.meetingDate,
              showTime: true,
            })),
          ]}
        />
      ) : rows.length === 0 ? (
        <>
          <EmptyState icon="tasks" title="Nenhuma tarefa encontrada" description="Crie uma tarefa ou ajuste os filtros." />
          {canCreate && <ListQuickAdd defaultStatus={defaultStatus} clientId={cliente !== "__none__" ? cliente : undefined} />}
        </>
      ) : (
        <div>
          <div className="mb-2 flex justify-end">
            <ListColumnsPicker allColumns={[...LIST_COLUMNS]} visible={visibleCols} />
          </div>
          <Table
            minWidth="860px"
            head={
              <>
                <Th className="w-8"></Th>
                <Th>{sortTh("titulo", "Tarefa")}</Th>
                {col("tipo") && <Th>Tipo</Th>}
                {col("status") && <Th>{sortTh("status", "Status")}</Th>}
                {col("prioridade") && <Th>{sortTh("prioridade", "Prioridade")}</Th>}
                {col("cliente") && <Th>Cliente</Th>}
                {col("responsavel") && <Th>Responsável</Th>}
                {col("vencimento") && <Th>{sortTh("vencimento", "Vencimento")}</Th>}
                {col("tags") && <Th>Tags</Th>}
                {col("criador") && <Th>Criada por</Th>}
                {canDelete && <Th className="w-10"></Th>}
              </>
            }
          >
            {sorted.map((t) => {
              const overdue = !!t.dueDate && !t.completedAt && t.dueDate < now && !["CONCLUIDA", "CANCELADA"].includes(t.status);
              return (
                <tr key={t.id} className="hover:bg-zinc-900/60">
                  <Td><SelectCircle id={t.id} /></Td>
                  <Td>
                    <Link href={`/tarefas/${t.id}`} className="font-medium text-zinc-100 hover:text-emerald-300">
                      {t.title}
                    </Link>
                    <span className="ml-2 space-x-1">
                      {t.subtasks.length > 0 && <Badge tone="zinc">{t.subtasks.filter((s) => s.status === "CONCLUIDA").length}/{t.subtasks.length} sub</Badge>}
                      {overdue && <Badge tone="red">vencida</Badge>}
                      {!t.assignedToId && <Badge tone="amber">sem responsável</Badge>}
                    </span>
                  </Td>
                  {col("tipo") && <Td><StatusBadge value={t.type} meta={TASK_TYPE_META} /></Td>}
                  {col("status") && (
                    <Td>
                      {canUpdate && t.status !== "CANCELADA" ? (
                        <RowStatusSelect taskId={t.id} status={t.status} options={statusFilterOptions.filter((o) => o.value !== "CANCELADA")} />
                      ) : (
                        <StatusBadge value={t.status} meta={statusMeta} />
                      )}
                    </Td>
                  )}
                  {col("prioridade") && <Td><StatusBadge value={t.priority} meta={PRIORITY_META} /></Td>}
                  {col("cliente") && (
                    <Td className="text-zinc-400">
                      {t.client ? (
                        <Link href={`/clientes/${t.client.id}`} className="hover:text-emerald-300">{t.client.name}</Link>
                      ) : "—"}
                    </Td>
                  )}
                  {col("responsavel") && (
                    <Td>
                      {t.assignedTo ? (
                        <span className="flex items-center gap-1.5">
                          <UserAvatar name={t.assignedTo.name} size="sm" />
                          <span className="text-xs text-zinc-400">{t.assignedTo.name.split(" ")[0]}</span>
                        </span>
                      ) : <span className="text-amber-500">—</span>}
                    </Td>
                  )}
                  {col("vencimento") && (
                    <Td className={overdue ? "text-red-400" : "text-zinc-400"}>{formatDate(t.dueDate)}</Td>
                  )}
                  {col("tags") && (
                    <Td>
                      <span className="flex flex-wrap gap-1">
                        {t.tags.map((tag) => <Badge key={tag} tone="zinc">#{tag}</Badge>)}
                        {t.tags.length === 0 && "—"}
                      </span>
                    </Td>
                  )}
                  {col("criador") && <Td className="text-xs text-zinc-500">{t.createdBy?.name ?? "—"}</Td>}
                  {canDelete && <Td className="text-right"><CardTrash id={t.id} deleteAction={deleteTask} label="tarefa" /></Td>}
                </tr>
              );
            })}
          </Table>
          {canCreate && <ListQuickAdd defaultStatus={defaultStatus} clientId={cliente !== "__none__" ? cliente : undefined} />}
        </div>
      )}
        <BulkBar entityLabel="tarefas" menus={bulkMenus} deleteAction={canDelete ? bulkDeleteTasks : undefined} />
      </SelectionProvider>
    </div>
  );
}
