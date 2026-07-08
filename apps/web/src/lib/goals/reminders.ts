import { and, eq, inArray, isNotNull, not } from "drizzle-orm";
import { db } from "@/db";
import { goals, notifications, type Goal } from "@/db/schema";
import { formatDate } from "@/lib/labels";
import { notifyRole, notifyUser } from "@/lib/notify";

type NotifyInput = {
  title: string;
  body?: string;
  type?: "INFO" | "ALERTA" | "COBRANCA" | "TAREFA" | "SISTEMA";
};

const CLOSED_STATUSES = ["CONCLUIDA", "CANCELADA", "FINALIZADA"] as const;
const NEAR_DUE_DAYS = 3;

/**
 * Notifica sobre uma meta respeitando o responsável: se houver ownerId, notifica
 * o responsável; se for uma meta geral sem dono, notifica OWNER/ADMIN.
 */
export async function notifyGoal(goal: Pick<Goal, "id" | "ownerId">, input: NotifyInput): Promise<void> {
  const payload = { ...input, entityType: "goal", entityId: goal.id };
  if (goal.ownerId) {
    await notifyUser(goal.ownerId, payload);
  } else {
    await notifyRole("OWNER", payload);
    await notifyRole("ADMIN", payload);
  }
}

/** Evita duplicar o mesmo lembrete: já existe notificação com este título para a meta? */
async function reminderExists(goalId: string, title: string): Promise<boolean> {
  const existing = await db.query.notifications.findFirst({
    where: and(eq(notifications.entityId, goalId), eq(notifications.title, title)),
    columns: { id: true },
  });
  return !!existing;
}

/**
 * Varre as metas em aberto com prazo e gera lembretes idempotentes:
 * - meta vencendo em até {NEAR_DUE_DAYS} dias → lembrete (INFO);
 * - meta vencida e não concluída → alerta (ALERTA).
 * Cada condição gera no máximo um lembrete por meta (dedupe por título+entidade),
 * então pode ser chamada com segurança a cada carregamento de página.
 */
export async function syncGoalReminders(): Promise<void> {
  const now = new Date();
  const soon = new Date(now.getTime() + NEAR_DUE_DAYS * 86400_000);

  const rows = await db.query.goals.findMany({
    where: and(isNotNull(goals.periodEnd), not(inArray(goals.status, [...CLOSED_STATUSES]))),
    columns: { id: true, title: true, ownerId: true, periodEnd: true },
  });

  for (const g of rows) {
    if (!g.periodEnd) continue;
    const overdue = g.periodEnd < now;
    const nearDue = !overdue && g.periodEnd <= soon;
    if (!overdue && !nearDue) continue;

    const title = overdue ? `Meta atrasada: ${g.title}` : `Meta próxima do prazo: ${g.title}`;
    if (await reminderExists(g.id, title)) continue;

    const body = overdue
      ? `Venceu em ${formatDate(g.periodEnd)} e ainda não foi concluída.`
      : `Vence em ${formatDate(g.periodEnd)}. Atualize o progresso ou o status.`;
    await notifyGoal(g, { title, body, type: overdue ? "ALERTA" : "INFO" });
  }
}
