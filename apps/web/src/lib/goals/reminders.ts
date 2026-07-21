import { and, eq, inArray, isNotNull, not } from "drizzle-orm";
import { db } from "@/db";
import { goals, notifications, roles, userRoles, users, type Goal, type RoleName } from "@/db/schema";
import { addDaysDateOnly, formatDateOnly, todayDateOnly } from "@/lib/date";
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

/**
 * Resolve, em UMA query, os usuários ATIVOS que têm qualquer um dos papéis
 * informados (união, sem duplicar). Espelha o filtro de notify.notifyRole.
 */
async function activeUserIdsWithRoles(roleNames: RoleName[]): Promise<string[]> {
  if (!roleNames.length) return [];
  const rows = await db
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .innerJoin(users, eq(userRoles.userId, users.id))
    .where(and(inArray(roles.name, roleNames), eq(users.isActive, true), eq(users.status, "ATIVO")));
  return [...new Set(rows.map((r) => r.userId))];
}

/**
 * Varre as metas em aberto com prazo e gera lembretes idempotentes:
 * - meta vencendo em até {NEAR_DUE_DAYS} dias → lembrete (INFO);
 * - meta vencida e não concluída → alerta (ALERTA).
 * Cada condição gera no máximo um lembrete por meta (dedupe por título+entidade),
 * então pode ser chamada com segurança a cada carregamento de página.
 *
 * Custo: número FIXO de idas ao banco (não mais 1 + N). Em regime normal
 * (nada novo a notificar) são apenas 2 queries e retorna. Antes, era um
 * findFirst por meta em série a cada GET — o maior peso do dashboard.
 */
export async function syncGoalReminders(): Promise<void> {
  // periodEnd é data-only ('YYYY-MM-DD'); comparamos com hoje/prazo como string.
  const today = todayDateOnly();
  const soon = addDaysDateOnly(today, NEAR_DUE_DAYS);

  const rows = await db.query.goals.findMany({
    where: and(isNotNull(goals.periodEnd), not(inArray(goals.status, [...CLOSED_STATUSES]))),
    columns: { id: true, title: true, ownerId: true, periodEnd: true },
  });

  // 1) Em memória: quais metas precisam de lembrete e qual (título/corpo/tipo).
  const pending = rows.flatMap((g) => {
    if (!g.periodEnd) return [];
    const overdue = g.periodEnd < today;
    const nearDue = !overdue && g.periodEnd <= soon;
    if (!overdue && !nearDue) return [];
    const title = overdue ? `Meta atrasada: ${g.title}` : `Meta próxima do prazo: ${g.title}`;
    const body = overdue
      ? `Venceu em ${formatDateOnly(g.periodEnd)} e ainda não foi concluída.`
      : `Vence em ${formatDateOnly(g.periodEnd)}. Atualize o progresso ou o status.`;
    return [{ goalId: g.id, ownerId: g.ownerId, title, body, type: overdue ? ("ALERTA" as const) : ("INFO" as const) }];
  });
  if (!pending.length) return;

  // 2) Dedupe em lote: UMA query traz todos os títulos já notificados dessas metas.
  const goalIds = [...new Set(pending.map((p) => p.goalId))];
  const existing = await db
    .select({ entityId: notifications.entityId, title: notifications.title })
    .from(notifications)
    .where(and(eq(notifications.entityType, "goal"), inArray(notifications.entityId, goalIds)));
  const seen = new Set(existing.map((e) => `${e.entityId}|${e.title}`));
  const fresh = pending.filter((p) => !seen.has(`${p.goalId}|${p.title}`));
  if (!fresh.length) return;

  // 3) Destinatários de metas SEM dono (OWNER/ADMIN ativos) resolvidos UMA vez.
  const roleRecipients = fresh.some((p) => !p.ownerId)
    ? await activeUserIdsWithRoles(["OWNER", "ADMIN"])
    : [];

  // 4) UM único insert com todos os lembretes novos.
  const values = fresh.flatMap((p) => {
    const base = { type: p.type, title: p.title, body: p.body, entityType: "goal", entityId: p.goalId };
    const recipients = p.ownerId ? [p.ownerId] : roleRecipients;
    return recipients.map((userId) => ({ userId, ...base }));
  });
  if (values.length) await db.insert(notifications).values(values);
}
