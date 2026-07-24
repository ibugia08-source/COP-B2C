import { eq, inArray, isNull, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { clients, digitalAssetGroups, digitalAssets, documents, taskAssignees, tasks } from "@/db/schema";
import type { SessionPayload } from "./session";
import { can, canActOnAll, isAdminGeral } from "./access";
import type { PermissionKey } from "./permissions";

// Escopo de ownership (RBAC 2.0).
// - LEITURA de clientes e tarefas é ABERTA a todos (requisito): as condições de
//   escopo devolvem `undefined` (sem filtro).
// - ESCRITA usa o par próprio/amplo: quem tem a variante `_all` da ação (ou é
//   Administrador Geral) age sobre QUALQUER entidade; senão precisa ser dono.
// - Ativos e Documentos mantêm escopo por cliente (dados sensíveis): quem não
//   é dono precisa de `*.access_all` (ou ser Admin Geral) para operar/ver.
// As funções is*Owner são puras (membership), testáveis sem banco.

export type ClientOwnershipInput = {
  strategistId: string | null;
  trafficManager1Id: string | null;
  trafficManager2Id: string | null;
};

/** Membership pura: o usuário é um dos responsáveis pelo cliente? */
export function isClientOwner(
  userId: string,
  client: ClientOwnershipInput | null | undefined,
): boolean {
  if (!client) return false;
  return [client.strategistId, client.trafficManager1Id, client.trafficManager2Id].includes(userId);
}

export type AssetOwnershipInput = {
  /** clientId efetivo do ativo (asset.clientId ?? grupo.clientId) */
  clientId: string | null;
  client: ClientOwnershipInput | null;
};

/**
 * Membership pura para ativos: com cliente vinculado, vale o ownership do
 * cliente. Ativo sem cliente (INTERNO/infra da agência) não tem dono — só
 * Admin Geral / `digital_assets.access_all` operam (resolvido no chamador).
 */
export function isAssetOwner(
  userId: string,
  asset: AssetOwnershipInput | null | undefined,
): boolean {
  if (!asset) return false;
  if (!asset.clientId) return false;
  return isClientOwner(userId, asset.client);
}

export type TaskOwnershipInput = {
  assignedToId: string | null;
  createdById: string | null;
  assigneeIds: readonly string[];
  client: ClientOwnershipInput | null;
};

/**
 * Membership pura para tarefas: responsável, responsável adicional, criador, ou
 * responsável pelo cliente da tarefa. Tarefa interna sem cliente e sem
 * responsável é colaborativa (qualquer um edita).
 */
export function isTaskOwner(
  userId: string,
  task: TaskOwnershipInput | null | undefined,
): boolean {
  if (!task) return false;
  if (task.assignedToId === userId || task.createdById === userId) return true;
  if (task.assigneeIds.includes(userId)) return true;
  if (task.client) return isClientOwner(userId, task.client);
  return !task.assignedToId && task.assigneeIds.length === 0;
}

// ---------------------------------------------------------------------------
// Condições SQL para as listagens (page.tsx)
// ---------------------------------------------------------------------------

function managedClientsCondition(userId: string): SQL {
  return or(
    eq(clients.strategistId, userId),
    eq(clients.trafficManager1Id, userId),
    eq(clients.trafficManager2Id, userId),
  )!;
}

/** Clientes: LEITURA aberta a todos — sem filtro. */
export function clientScopeCondition(_session: SessionPayload): SQL | undefined {
  return undefined;
}

/** Tarefas: LEITURA aberta a todos — sem filtro. */
export function taskScopeCondition(_session: SessionPayload): SQL | undefined {
  return undefined;
}

/**
 * "Tarefas atreladas a mim": filtro OPCIONAL da tela de Tarefas (não é escopo
 * de permissão). Considera todos os vínculos possíveis do usuário:
 *  - é o responsável direto;
 *  - é responsável adicional (task_assignees);
 *  - criou a tarefa;
 *  - é estrategista / gestor 1 / gestor 2 do CLIENTE da tarefa.
 *
 * O último caso é o que o usuário pediu: ver o que cai na conta dele por ser
 * G1/G2/estrategista da conta, mesmo sem estar como responsável da tarefa.
 */
export function myTasksCondition(userId: string): SQL {
  const managedClients = db
    .select({ id: clients.id })
    .from(clients)
    .where(managedClientsCondition(userId));
  const asExtraAssignee = db
    .select({ id: taskAssignees.taskId })
    .from(taskAssignees)
    .where(eq(taskAssignees.userId, userId));
  return or(
    eq(tasks.assignedToId, userId),
    eq(tasks.createdById, userId),
    inArray(tasks.id, asExtraAssignee),
    inArray(tasks.clientId, managedClients),
  )!;
}

/** true se a sessão enxerga QUALQUER ativo (Admin Geral ou access_all). */
function seesAllAssets(session: SessionPayload): boolean {
  return isAdminGeral(session) || can(session, "digital_assets.access_all");
}

/** true se a sessão enxerga QUALQUER documento (Admin Geral ou access_all). */
function seesAllDocs(session: SessionPayload): boolean {
  return isAdminGeral(session) || can(session, "documents.access_all");
}

/**
 * Documentos: escopo por cliente, salvo Admin Geral / documents.access_all.
 * Sem access_all, o usuário vê documentos internos (sem cliente), os dos
 * clientes que gerencia, e os que ele mesmo criou.
 */
export function documentScopeCondition(session: SessionPayload): SQL | undefined {
  if (seesAllDocs(session)) return undefined;
  const uid = session.userId;
  const managedClients = db
    .select({ id: clients.id })
    .from(clients)
    .where(managedClientsCondition(uid));
  return or(
    isNull(documents.clientId),
    inArray(documents.clientId, managedClients),
    eq(documents.createdById, uid),
  );
}

/** Ativos: escopo por cliente, salvo Admin Geral / access_all. */
export function assetScopeCondition(session: SessionPayload): SQL | undefined {
  if (seesAllAssets(session)) return undefined;
  const uid = session.userId;
  const managedClients = db
    .select({ id: clients.id })
    .from(clients)
    .where(managedClientsCondition(uid));
  const groupsOfManagedClients = db
    .select({ id: digitalAssetGroups.id })
    .from(digitalAssetGroups)
    .where(inArray(digitalAssetGroups.clientId, managedClients));
  // Sem access_all, o usuário só vê ativos ligados aos clientes que gerencia
  // (ativos internos, sem cliente, ficam restritos a Admin Geral / access_all).
  return or(
    inArray(digitalAssets.clientId, managedClients),
    inArray(digitalAssets.groupId, groupsOfManagedClients),
  );
}

// ---------------------------------------------------------------------------
// Resolvedores por entidade (async): usados nas actions/rotas de ESCRITA
// ---------------------------------------------------------------------------

/**
 * true se o usuário pode operar sobre o cliente para a ação indicada.
 * `allKey` é a chave-base da ação (ex.: "clients.update"): quem tiver a
 * variante `_all` age sobre qualquer cliente. Sem `allKey`, exige ser dono
 * (ou Admin Geral).
 */
export async function canAccessClient(
  session: SessionPayload,
  clientId: string,
  allKey: PermissionKey = "clients.update",
): Promise<boolean> {
  if (isAdminGeral(session)) return true;
  if (canActOnAll(session, allKey)) return true;
  const client = await db.query.clients.findFirst({
    where: eq(clients.id, clientId),
    columns: { strategistId: true, trafficManager1Id: true, trafficManager2Id: true },
  });
  return isClientOwner(session.userId, client);
}

/** true se o usuário pode operar sobre o ativo (via cliente do ativo/grupo). */
export async function canAccessAsset(session: SessionPayload, assetId: string): Promise<boolean> {
  if (seesAllAssets(session)) return true;
  const asset = await db.query.digitalAssets.findFirst({
    where: eq(digitalAssets.id, assetId),
    columns: { clientId: true },
    with: {
      group: { columns: { clientId: true } },
      client: {
        columns: { strategistId: true, trafficManager1Id: true, trafficManager2Id: true },
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
        columns: { strategistId: true, trafficManager1Id: true, trafficManager2Id: true },
      })) ?? null;
  }
  return isAssetOwner(session.userId, { clientId: effectiveClientId, client });
}

/**
 * Particiona um lote de ativos por acesso, com UMA query (+1 para clientes
 * herdados do grupo). `missing` = ids inexistentes (não contam como negação).
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
        columns: { strategistId: true, trafficManager1Id: true, trafficManager2Id: true },
      },
    },
  });
  const found = new Set(rows.map((r) => r.id));
  const missing = unique.filter((id) => !found.has(id));

  if (seesAllAssets(session)) {
    return { allowed: rows.map((r) => r.id), denied: [], missing };
  }

  // clientes herdados só do grupo (asset.clientId null): carrega em lote
  const inheritedClientIds = [
    ...new Set(rows.filter((r) => !r.clientId && r.group?.clientId).map((r) => r.group!.clientId!)),
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
    const ok = isAssetOwner(session.userId, { clientId: effectiveClientId, client });
    (ok ? allowed : denied).push(row.id);
  }
  return { allowed, denied, missing };
}

/**
 * true se o usuário pode escrever na tarefa. `allKey` = chave-base da ação
 * (ex.: "tasks.update" / "tasks.delete"): a variante `_all` libera qualquer
 * tarefa; senão exige ser dono (ou Admin Geral).
 */
export async function canAccessTask(
  session: SessionPayload,
  taskId: string,
  allKey: PermissionKey = "tasks.update",
): Promise<boolean> {
  if (isAdminGeral(session)) return true;
  if (canActOnAll(session, allKey)) return true;
  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
    columns: { assignedToId: true, createdById: true },
    with: {
      assignees: { columns: { userId: true } },
      client: {
        columns: { strategistId: true, trafficManager1Id: true, trafficManager2Id: true },
      },
    },
  });
  if (!task) return false;
  return isTaskOwner(session.userId, {
    assignedToId: task.assignedToId,
    createdById: task.createdById,
    assigneeIds: task.assignees.map((a) => a.userId),
    client: task.client ?? null,
  });
}
