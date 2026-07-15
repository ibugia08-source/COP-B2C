import { redirect } from "next/navigation";
import type { SessionPayload } from "./session";
import { getSession, getSessionState } from "./session-server";
import { type PermissionKey } from "./permissions";
import { isAdminGeral } from "./access";

// Guards de sessão/permissão. A decisão de acesso vive em ./access.ts (can /
// isAdminGeral). Aqui ficam apenas os wrappers de página (redirect) e de
// action/route (retornam erro). As permissões efetivas já vêm precomputadas na
// sessão (padrão do cargo ∪ extras) — ver session-server.ts.

/** Exige sessão ativa; senão redireciona para /login. */
export async function requireSession(): Promise<SessionPayload> {
  const { session, revoked } = await getSessionState();
  if (!session) redirect(revoked ? "/login?reason=session_revoked" : "/login");
  return session;
}

/** Exige sessão + permissão; senão redireciona para /acesso-negado. */
export async function requirePermission(permission: PermissionKey): Promise<SessionPayload> {
  const session = await requireSession();
  if (!session.permissions.includes(permission)) redirect("/acesso-negado");
  return session;
}

/** Versão para server actions/APIs: retorna erro em vez de redirecionar. */
export async function checkPermission(
  permission: PermissionKey,
): Promise<{ ok: true; session: SessionPayload } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sessão expirada. Faça login novamente." };
  if (!session.permissions.includes(permission)) {
    return { ok: false, error: "Você não tem permissão para esta ação." };
  }
  return { ok: true, session };
}

/** Administrador Geral — usado por módulos restritos (Equipe, config, acessos). */
export function isAdmin(session: SessionPayload): boolean {
  return isAdminGeral(session);
}

/** Exige sessão + Administrador Geral; senão redireciona para /acesso-negado. */
export async function requireAdmin(): Promise<SessionPayload> {
  const session = await requireSession();
  if (!isAdminGeral(session)) redirect("/acesso-negado");
  return session;
}

/** Versão para server actions/APIs: exige Administrador Geral, sem redirecionar. */
export async function checkAdmin(): Promise<
  { ok: true; session: SessionPayload } | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sessão expirada. Faça login novamente." };
  if (!isAdminGeral(session)) return { ok: false, error: "Apenas o Administrador Geral acessa este recurso." };
  return { ok: true, session };
}

export function sessionPermissions(session: SessionPayload): Set<PermissionKey> {
  return new Set(session.permissions);
}

export function hasPermission(session: SessionPayload, permission: PermissionKey): boolean {
  return session.permissions.includes(permission);
}
