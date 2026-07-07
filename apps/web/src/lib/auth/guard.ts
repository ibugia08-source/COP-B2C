import { redirect } from "next/navigation";
import { getSession, type SessionPayload } from "./session";
import { roleHasPermission, ROLE_PERMISSIONS, type PermissionKey } from "./permissions";

/** Exige sessão ativa; senão redireciona para /login. */
export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/** Exige sessão + permissão; senão redireciona para /acesso-negado. */
export async function requirePermission(permission: PermissionKey): Promise<SessionPayload> {
  const session = await requireSession();
  if (!roleHasPermission(session.roles, permission)) redirect("/acesso-negado");
  return session;
}

/** Versão para server actions/APIs: retorna erro em vez de redirecionar. */
export async function checkPermission(
  permission: PermissionKey,
): Promise<{ ok: true; session: SessionPayload } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sessão expirada. Faça login novamente." };
  if (!roleHasPermission(session.roles, permission)) {
    return { ok: false, error: "Você não tem permissão para esta ação." };
  }
  return { ok: true, session };
}

export function sessionPermissions(session: SessionPayload): Set<PermissionKey> {
  const keys = new Set<PermissionKey>();
  for (const role of session.roles) {
    for (const key of ROLE_PERMISSIONS[role] ?? []) keys.add(key);
  }
  return keys;
}

export function hasPermission(session: SessionPayload, permission: PermissionKey): boolean {
  return roleHasPermission(session.roles, permission);
}
