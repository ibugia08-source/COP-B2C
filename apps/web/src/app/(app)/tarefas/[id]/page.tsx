import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { taskTemplates, tasks, users } from "@/db/schema";
import { hasPermission, requirePermission } from "@/lib/auth/guard";
import { taskOwnershipCheck } from "@/lib/auth/ownership";
import { resolveOptions } from "@/lib/config-options";
import {
  CLIENT_STATUS_META,
  formatDate,
  HEALTH_META,
  PRIORITY_META,
  TASK_STATUS_META,
  TASK_TYPE_META,
  type Tone,
} from "@/lib/labels";
import {
  Badge,
  EmptyState,
  StatusBadge,
  UserAvatar,
} from "@/components/ui/primitives";
import { TaskCreateButton } from "../ui";
import {
  AssignSelect,
  AttachmentForm,
  ChecklistSection,
  CommentForm,
  CreativeBriefSection,
  TaskStatusControls,
  TimeEntryForm,
} from "./ui";

export default async function TarefaDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("tasks.view");
  const { id } = await params;

  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, id),
    with: {
      client: true,
      digitalAsset: true,
      assignedTo: true,
      createdBy: true,
      parent: true,
      subtasks: { with: { assignedTo: true } },
      assignees: { with: { user: true } },
      comments: { with: { author: true }, orderBy: (c, { desc }) => [desc(c.createdAt)] },
      checklists: { with: { items: { orderBy: (i, { asc: a }) => [a(i.order)] } } },
      attachments: true,
      timeEntries: true,
    },
  });
  if (!task) notFound();

  // escopo de ownership: quem não é OWNER/ADMIN só abre tarefas suas ou de clientes que gerencia
  const inScope = taskOwnershipCheck(session.roles, session.userId, {
    assignedToId: task.assignedToId,
    createdById: task.createdById,
    assigneeIds: task.assignees.map((a) => a.userId),
    client: task.client ?? null,
  });
  if (!inScope) redirect("/acesso-negado");

  const canUpdate = hasPermission(session, "tasks.update");
  const canComplete = hasPermission(session, "tasks.complete");
  const canAssign = hasPermission(session, "tasks.assign");
  const canCreate = hasPermission(session, "tasks.create");

  const [allUsers, allClients, templates, statusOptionsAll] = await Promise.all([
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.isActive, true)),
    db.query.clients.findMany({ columns: { id: true, name: true } }),
    db
      .select({ slug: taskTemplates.slug, name: taskTemplates.name })
      .from(taskTemplates)
      .where(eq(taskTemplates.isActive, true))
      .orderBy(asc(taskTemplates.name)),
    resolveOptions("tasks", "status"),
  ]);

  const statusMeta: Record<string, { label: string; tone: Tone }> = { ...TASK_STATUS_META };
  for (const o of statusOptionsAll) statusMeta[o.value] = { label: o.label, tone: o.color };
  const statusOptions = statusOptionsAll
    .filter((o) => o.isActive)
    .map((o) => ({ value: o.value, label: o.label }));

  const overdue =
    !!task.dueDate && !task.completedAt && task.dueDate < new Date() &&
    !["CONCLUIDA", "CANCELADA"].includes(task.status);

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <div className="space-y-6 xl:col-span-2">
        <div>
          {task.parent && (
            <p className="mb-1 text-xs text-zinc-500">
              Subtarefa de{" "}
              <Link href={`/tarefas/${task.parent.id}`} className="text-emerald-400 hover:underline">
                {task.parent.title}
              </Link>
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold">{task.title}</h1>
            <StatusBadge value={task.status} meta={statusMeta} />
            <StatusBadge value={task.priority} meta={PRIORITY_META} />
            <StatusBadge value={task.type} meta={TASK_TYPE_META} />
            {overdue && <Badge tone="red">vencida</Badge>}
          </div>
          {task.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {task.tags.map((t) => (
                <Badge key={t} tone="zinc">#{t}</Badge>
              ))}
            </div>
          )}
        </div>

        {canUpdate && (
          <TaskStatusControls taskId={task.id} status={task.status} statusOptions={statusOptions} canComplete={canComplete} />
        )}

        {task.type === "CRIATIVO" && (
          <CreativeBriefSection taskId={task.id} brief={task.creative ?? null} canUpdate={canUpdate} />
        )}

        {task.description && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <h3 className="mb-1 text-xs font-semibold uppercase text-zinc-500">Descrição</h3>
            <p className="whitespace-pre-wrap text-sm text-zinc-300">{task.description}</p>
          </div>
        )}
        {task.status === "CANCELADA" && task.cancelReason && (
          <div className="rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-300">
            <strong>Cancelada:</strong> {task.cancelReason}
          </div>
        )}

        <section>
          <h3 className="mb-2 text-sm font-semibold text-zinc-300">Checklists</h3>
          {canUpdate ? (
            <ChecklistSection
              taskId={task.id}
              checklists={task.checklists.map((cl) => ({
                id: cl.id,
                title: cl.title,
                items: cl.items.map((i) => ({ id: i.id, content: i.content, isDone: i.isDone })),
              }))}
              templates={templates}
            />
          ) : task.checklists.length === 0 ? (
            <EmptyState icon="☑" title="Sem checklists" />
          ) : null}
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-300">
              Subtarefas ({task.subtasks.filter((s) => s.status === "CONCLUIDA").length}/{task.subtasks.length})
            </h3>
            {canCreate && !task.parentTaskId && (
              <TaskCreateButton
                users={allUsers}
                clients={allClients}
                defaultClientId={task.clientId ?? undefined}
                parentTaskId={task.id}
                label="+ Subtarefa"
              />
            )}
          </div>
          {task.subtasks.length === 0 ? (
            <p className="text-sm text-zinc-500">Nenhuma subtarefa.</p>
          ) : (
            <ul className="space-y-1">
              {task.subtasks.map((s) => (
                <li key={s.id} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
                  <Link href={`/tarefas/${s.id}`} className={`text-sm ${s.status === "CONCLUIDA" ? "text-zinc-500 line-through" : "text-zinc-200 hover:text-emerald-300"}`}>
                    {s.title}
                  </Link>
                  <span className="flex items-center gap-2 text-xs text-zinc-500">
                    <StatusBadge value={s.status} meta={statusMeta} />
                    {s.assignedTo && <UserAvatar name={s.assignedTo.name} size="sm" />}
                    {s.dueDate && formatDate(s.dueDate)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-zinc-300">Comentários ({task.comments.length})</h3>
          <div className="space-y-3">
            <CommentForm taskId={task.id} />
            {task.comments.length === 0 ? (
              <p className="text-sm text-zinc-500">Seja o primeiro a comentar.</p>
            ) : (
              task.comments.map((c) => (
                <div key={c.id} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                  <div className="mb-1 flex items-center gap-2 text-xs text-zinc-500">
                    <UserAvatar name={c.author?.name} size="sm" />
                    <span>{c.author?.name ?? "Sistema"}</span>
                    <span>·</span>
                    <span>{formatDate(c.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-zinc-200">{c.body}</p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <aside className="space-y-4">
        {task.client && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase text-zinc-500">Cliente vinculado</h3>
            <Link href={`/clientes/${task.client.id}`} className="text-sm font-semibold text-zinc-100 hover:text-emerald-300">
              {task.client.name} →
            </Link>
            {task.client.niche && <p className="text-xs text-zinc-500">{task.client.niche}</p>}
            <div className="mt-2 flex flex-wrap gap-1">
              <StatusBadge value={task.client.status} meta={CLIENT_STATUS_META} />
              <StatusBadge value={task.client.healthStatus} meta={HEALTH_META} />
            </div>
          </div>
        )}

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase text-zinc-500">Detalhes</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-zinc-500">Cliente</dt>
              <dd>
                {task.client ? (
                  <Link href={`/clientes/${task.client.id}`} className="text-emerald-400 hover:underline">
                    {task.client.name}
                  </Link>
                ) : <span className="text-zinc-500">sem cliente</span>}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-zinc-500">Responsável</dt>
              <dd className="min-w-0 flex-1 pl-4">
                {canAssign ? (
                  <AssignSelect taskId={task.id} current={task.assignedToId} users={allUsers} />
                ) : (
                  task.assignedTo?.name ?? "—"
                )}
              </dd>
            </div>
            {task.assignees.length > 0 && (
              <div className="flex justify-between gap-2">
                <dt className="text-zinc-500">Outros</dt>
                <dd className="flex flex-wrap justify-end gap-1">
                  {task.assignees.map((a) => (
                    <UserAvatar key={a.userId} name={a.user.name} size="sm" />
                  ))}
                </dd>
              </div>
            )}
            {task.digitalAsset && (
              <div className="flex justify-between gap-2">
                <dt className="text-zinc-500">Ativo digital</dt>
                <dd>
                  <Link href={`/ativos/${task.digitalAsset.id}`} className="text-emerald-400 hover:underline">
                    {task.digitalAsset.title}
                  </Link>
                </dd>
              </div>
            )}
            <div className="flex justify-between"><dt className="text-zinc-500">Criada por</dt><dd>{task.createdBy?.name ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-500">Início</dt><dd>{formatDate(task.startDate)}</dd></div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Vencimento</dt>
              <dd className={overdue ? "text-red-400" : ""}>{formatDate(task.dueDate)}</dd>
            </div>
            <div className="flex justify-between"><dt className="text-zinc-500">Concluída em</dt><dd>{formatDate(task.completedAt)}</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-500">Estimado</dt><dd>{task.estimatedMinutes ? `${task.estimatedMinutes} min` : "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-500">Rastreado</dt><dd>{task.trackedMinutes} min</dd></div>
          </dl>
        </div>

        {canUpdate && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase text-zinc-500">Registrar tempo</h3>
            <TimeEntryForm taskId={task.id} />
          </div>
        )}

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase text-zinc-500">
            Anexos ({task.attachments.length})
          </h3>
          <ul className="mb-3 space-y-1">
            {task.attachments.map((a) => (
              <li key={a.id}>
                <a href={a.fileUrl} target="_blank" rel="noreferrer" className="text-sm text-emerald-400 hover:underline">
                  📎 {a.fileName}
                </a>
              </li>
            ))}
            {task.attachments.length === 0 && <li className="text-sm text-zinc-500">Nenhum anexo.</li>}
          </ul>
          {canUpdate && <AttachmentForm taskId={task.id} />}
        </div>
      </aside>
    </div>
  );
}
