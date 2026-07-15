import type { SessionPayload } from "./session";
import { allVariantOf, type PermissionKey } from "./permissions";

// ---------------------------------------------------------------------------
// Camada única de decisão de acesso (RBAC 2.0). Menu, UI e servidor consomem
// SEMPRE estas funções — nada de comparar nome de cargo espalhado pelo código.
// ---------------------------------------------------------------------------

/** true se a sessão tem a permissão efetiva (padrão do cargo ∪ extras). */
export function can(session: SessionPayload, key: PermissionKey): boolean {
  return session.permissions.includes(key);
}

/** Administrador Geral — único acima do teto (concede acessos, mexe em config). */
export function isAdminGeral(session: SessionPayload): boolean {
  return session.cargo === "ADMINISTRADOR_GERAL";
}

/**
 * true se a sessão pode agir sobre QUALQUER entidade para a ação `baseKey`,
 * i.e. possui a variante ampla `baseKey_all`. Ex.: canActOnAll(s,"tasks.update").
 */
export function canActOnAll(session: SessionPayload, baseKey: PermissionKey): boolean {
  const all = allVariantOf(baseKey);
  return all ? session.permissions.includes(all) : false;
}
