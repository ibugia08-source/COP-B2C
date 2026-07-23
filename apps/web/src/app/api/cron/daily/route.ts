import { NextResponse } from "next/server";
import { and, isNotNull, lt, not, inArray } from "drizzle-orm";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { emitEvent } from "@/lib/automations/engine";
import { syncGoalReminders } from "@/lib/goals/reminders";
import { addDaysDateOnly, todayDateOnly } from "@/lib/date";

/**
 * Rotina diária do sistema (Vercel Cron — ver `crons` em vercel.json).
 *
 * Existe porque havia automações que dependiam de tempo e nunca disparavam:
 * `TASK_OVERDUE` e `TASK_DUE_SOON` estavam no enum de gatilhos mas nenhum código
 * os emitia. Também tira `syncGoalReminders` do caminho de render das páginas
 * (antes rodava a cada GET do dashboard/metas, gerando escrita no banco no meio
 * da renderização).
 *
 * SEGURANÇA: a rota é pública no proxy (o agendador não tem cookie de sessão),
 * então a proteção é o CRON_SECRET. A Vercel envia `Authorization: Bearer
 * <CRON_SECRET>` quando a env existe. Sem CRON_SECRET configurado a rota se
 * recusa a rodar — nunca fica aberta.
 */

/** Quantos dias antes do vencimento contam como "vence em breve". */
const DUE_SOON_DAYS = 2;

const CLOSED = ["CONCLUIDA", "CANCELADA"] as const;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false; // sem segredo configurado, não roda
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET ausente ou inválido." },
      { status: 401 },
    );
  }

  const today = todayDateOnly();
  const soon = addDaysDateOnly(today, DUE_SOON_DAYS);
  const open = not(inArray(tasks.status, [...CLOSED]));

  // 1) tarefas vencidas (prazo < hoje)
  const overdue = await db
    .select({ id: tasks.id, clientId: tasks.clientId, assignedToId: tasks.assignedToId })
    .from(tasks)
    .where(and(open, isNotNull(tasks.dueDate), lt(tasks.dueDate, today)));

  for (const t of overdue) {
    await emitEvent("TASK_OVERDUE", {
      taskId: t.id,
      clientId: t.clientId ?? undefined,
      assigneeId: t.assignedToId,
    });
  }

  // 2) tarefas vencendo em breve (hoje <= prazo <= hoje + N)
  const dueSoon = await db
    .select({ id: tasks.id, clientId: tasks.clientId, assignedToId: tasks.assignedToId })
    .from(tasks)
    .where(and(open, isNotNull(tasks.dueDate), not(lt(tasks.dueDate, today)), lt(tasks.dueDate, soon)));

  for (const t of dueSoon) {
    await emitEvent("TASK_DUE_SOON", {
      taskId: t.id,
      clientId: t.clientId ?? undefined,
      assigneeId: t.assignedToId,
    });
  }

  // 3) lembretes de metas (idempotente — não duplica se rodar de novo)
  await syncGoalReminders();

  return NextResponse.json({
    ok: true,
    ranAt: new Date().toISOString(),
    overdue: overdue.length,
    dueSoon: dueSoon.length,
  });
}
