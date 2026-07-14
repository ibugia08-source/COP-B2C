import { and, eq, inArray, isNull, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { clients, digitalAssetGroups, digitalAssets, taskAssignees, tasks } from "@/db/schema";
import type { SessionPayload } from "./session";

// Escopo de ownership: além da permissão (RBAC), operações sensíveis exigem
// que o usuário seja responsável pelo cliente/ativo/tarefa em questão.
// OWNER/ADMIN enxergam e operam tudo. As funções *Check são puras (testáveis
// sem banco); can* resolvem a entidade e delegam para elas.

type Roles = readonly string[];

export function isElevated(roles: Roles): boolean {
  return roles.some((r) => r === "OWNER" || r === "ADMIN");
}

export type ClientOwnershipInput = {
  strategistId: string | null;
  trafficManager1Id: string | null;
  trafficManager2Id: string | null;
};

/** Regra pura: OWNER/ADMIN sempre; demais precisam ser um dos responsáveis. */
export function clientOwnershipCheck(
  roles: Roles,
  userId: string,
  client: ClientOwnershipInput | null | undefined,
): boolean {
  if (isElevated(roles)) return true;
  if (!client) return false;
  return [
    client.strategistId,
    client.trafficManager1Id,
    client.trafficManager2Id,
  ].includes(userId);
}

export type AssetOwnershipInput = {
  /** clientId efetivo do ativo (asset.clientId ?? grupo.clientId) */
  clientId: string | null;
  client: ClientOwnershipInput | null;
};

/**
 * Regra pura para ativos: com cliente vinculado, vale o ownership do cliente.
 * Sem cliente (INTERNO/PLATAFORMA/backup da agência) o escopo é restrito a
 * OWNER/ADMIN/GESTOR_OPERACIONAL.
 * SECURITY DECISION: ativo sem cliente é infraestrutura da agência — na dúvida,
 * o acesso é o mais restritivo possível sem travar a operação interna.
 */
export function assetOwnershipCheck(
  roles: Roles,
  userId: string,
  asset: AssetOwnershipInput | null | undefined,
): boolean {
  if (isElevated(roles)) return true;
  if (!asset) return false;
  if (!asset.clientId) return roles.includes("GESTOR_OPERACIONAL");
  return clientOwnershipCheck(roles, userId, asset.client);
}

export type TaskOwnershipInput = {
  assignedToId: string | null;
  createdById: string | null;
  assigneeIds: readonly string[];
  client: ClientOwnershipInput | null;
};

/**
 * Regra pura para tarefas: responsável, responsável adicional, criador,
 * ou responsável pelo cliente da tarefa. Tarefa sem cliente e sem responsáveis
 * é interna — qualquer papel com a permissão pode escrever.
 */
export function taskOwnershipCheck(
  roles: Roles,
  userId: string,
  task: TaskOwnershipInput | null | undefined,
): boolean {
  if (isElevated(roles)) return true;
  if (!task) return false;
  if (task.assignedToId === userId || task.createdById === userId) return true;
  if (task.assigneeIds.includes(userId)) return true;
  if (task.client) return clientOwnershipCheck(roles, userId, task.client);
  // sem cliente vinculado: tarefa interna sem dono — não bloqueia colaboração
  return !task.assignedToId && task.assigneeIds.length === 0;
}

// ---------------------------------------------------------------------------
// Condições SQL para as listagens (page.tsx): OWNER/ADMIN veem tudo
// (undefined = sem filtro); demais veem só o que gerenciam.
// ---------------------------------------------------------------------------

function managedClientsCondition(userId: string): SQL {
  return or(
    eq(clients.strategistId, userId),
    eq(clients.trafficManager1Id, userId),
    eq(clients.trafficManager2Id, userId),
  )!;
}

/** Filtro de escopo para listagens de clientes. */
export function clientScopeCondition(session: SessionPayload): SQL | undefined {
  if (isElevated(session.roles)) return undefined;
  return managedClientsCondition(session.userId);
}

/** Filtro de escopo para listagens de tarefas. */
export function taskScopeCondition(session: SessionPayload): SQL | undefined {
  if (isElevated(session.roles)) return undefined;
  const uid = session.userId;
  const managedClients = db
    .select({ id: clients.id })
    .from(clients)
    .where(managedClientsCondition(uid));
  const asExtraAssignee = db
    .select({ id: taskAssignees.taskId })
    .from(taskAssignees)
    .where(eq(taskAssignees.userId, uid));
  return or(
    eq(tasks.assignedToId, uid),
    eq(tasks.createdById, uid),
    inArray(tasks.id, asExtraAssignee),
    inArray(tasks.clientId, managedClients),
    // tarefa interna sem cliente e sem responsável: visível à equipe
    and(isNull(tasks.clientId), isNull(tasks.assignedToId)),
  );
}

/** Filtro de escopo para listagens de ativos digitais. */
export function assetScopeCondition(session: SessionPayload): SQL | undefined {
  if (isElevated(session.roles)) return undefined;
  const uid = session.userId;
  const managedClients = db
    .select({ id: clients.id })
    .from(clients)
    .where(managedClientsCondition(uid));
  const groupsOfManagedClients = db
    .select({ id: digitalAssetGroups.id })
    .from(digitalAssetGroups)
    .where(inArray(digitalAssetGroups.clientId, managedClients));
  const clientLinked = or(
    inArray(digitalAssets.clientId, managedClients),
    inArray(digitalAssets.groupId, groupsOfManagedClients),
  )!;
  if (!session.roles.includes("GESTOR_OPERACIONAL")) return clientLinked;
  // GESTOR_OPERACIONAL também vê ativos internos (sem cliente no ativo e no grupo)
  const groupsWithoutClient = db
    .select({ id: digitalAssetGroups.id })
    .from(digitalAssetGroups)
    .where(isNull(digitalAssetGroups.clientId));
  return or(
    clientLinked,
    and(isNull(digitalAssets.clientId), inArray(digitalAssets.groupId, groupsWithoutClient)),
  );
}

/** true se o usuário pode operar sobre o cliente. */
export async function canAccessClient(
  session: SessionPayload,
  clientId: string,
): Promise<boolean> {
  if (isElevated(session.roles)) return true;
  const client = await db.query.clients.findFirst({
    where: eq(clients.id, clientId),
    columns: {
      strategistId: true,
      trafficManager1Id: true,
      trafficManager2Id: true,
    },
  });
  return clientOwnershipCheck(session.roles, session.userId, client);
}

/** true se o usuário pode operar sobre o ativo digital (via cliente do ativo/grupo). */
export async function canAccessAsset(
  session: SessionPayload,
  assetId: string,
): Promise<boolean> {
  if (isElevated(session.roles)) return true;
  const asset = await db.query.digitalAssets.findFirst({
    where: eq(digitalAssets.id, assetId),
    columns: { clientId: true },
    with: {
      group: { columns: { clientId: true } },
      client: {
        columns: {
          strategistId: true,
          trafficManager1Id: true,
          trafficManager2Id: true,
        },
      },
    },
  });
  if (!asset) return false;
  const effectiveClientId = asset.clientId ?? asset.group?.clientId ?? null;
  let client = asset.client ?? null;
  if (!client && effectiveClientId) {
    client =
      (await db.query.clients.findFirst({
        where: eq(clients.id, effectiveClientId),
        columns: {
          strategistId: true,
          trafficManager1Id: true,
          trafficManager2Id: true,
        },
      })) ?? null;
  }
  return assetOwnershipCheck(session.roles, session.userId, {
    clientId: effectiveClientId,
    client,
  });
}

/**
 * Particiona um lote de ativos por acesso, com UMA query (+1 para clientes
 * herdados do grupo) em vez de N — usado pelas ações em massa.
 * `missing` = ids inexistentes (não contam como negação).
 */
export async function partitionAssetsByAccess(
  session: SessionPayload,
  ids: string[],
): Promise<{ allowed: string[]; denied: string[]; missing: string[] }> {
  const unique = [...new Set(ids)];
  if (!unique.length) return { allowed: [], denied: [], missing: [] };

  const rows = await db.query.digitalAssets.findMany({
    where: inArray(digitalAssets.id, unique),
    columns: { id: true, clientId: true },
    with: {
      group: { columns: { clientId: true } },
      client: {
        columns: {
          strategistId: true,
          trafficManager1Id: true,
          trafficManager2Id: true,
        },
      },
    },
  });
  const found = new Set(rows.map((r) => r.id));
  const missing = unique.filter((id) => !found.has(id));

  if (isElevated(session.roles)) {
    return { allowed: rows.map((r) => r.id), denied: [], missing };
  }

  // clientes herdados só do grupo (asset.clientId null): carrega em lote
  const inheritedClientIds = [
    ...new Set(
      rows
        .filter((r) => !r.clientId && r.group?.clientId)
        .map((r) => r.group!.clientId!),
    ),
  ];
  const inheritedClients = inheritedClientIds.length
    ? await db.query.clients.findMany({
        where: inArray(clients.id, inheritedClientIds),
        columns: {
          id: true,
          strategistId: true,
          trafficManager1Id: true,
          trafficManager2Id: true,
        },
      })
    : [];
  const clientById = new Map(inheritedClients.map((c) => [c.id, c]));

  const allowed: string[] = [];
  const denied: string[] = [];
  for (const row of rows) {
    const effectiveClientId = row.clientId ?? row.group?.clientId ?? null;
    const client =
      row.client ?? (effectiveClientId ? (clientById.get(effectiveClientId) ?? null) : null);
    const ok = assetOwnershipCheck(session.roles, session.userId, {
      clientId: effectiveClientId,
      client,
    });
    (ok ? allowed : denied).push(row.id);
  }
  return { allowed, denied, missing };
}

/** true se o usuário pode escrever na tarefa. */
export async function canAccessTask(session: SessionPayload, taskId: string): Promise<boolean> {
  if (isElevated(session.roles)) return true;
  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
    columns: { assignedToId: true, createdById: true },
    with: {
      assignees: { columns: { userId: true } },
      client: {
        columns: {
          strategistId: true,
          trafficManager1Id: true,
          trafficManager2Id: true,
        },
      },
    },
  });
  if (!task) return false;
  return taskOwnershipCheck(session.roles, session.userId, {
    assignedToId: task.assignedToId,
    createdById: task.createdById,
    assigneeIds: task.assignees.map((a) => a.userId),
    client: task.client ?? null,
  });
}
