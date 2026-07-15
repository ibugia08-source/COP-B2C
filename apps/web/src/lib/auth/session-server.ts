import { cache } from "react";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { users } from "@/db/schema";
import { effectivePermissions } from "./permissions";
import {
  SESSION_COOKIE,
  isSessionUserValid,
  verifySessionToken,
  type SessionPayload,
} from "./session";

// Validação da sessão contra o banco (revogação em tempo real).
// O proxy (edge) só confere a assinatura do JWT; a autorização de verdade
// acontece aqui, chamada por todo requireSession/requirePermission/checkPermission.
// `cache` do React deduplica a consulta dentro do mesmo request.

export type SessionState = {
  session: SessionPayload | null;
  /** true quando havia um token assinado válido, mas o usuário foi
   *  desativado/rejeitado ou teve papéis alterados (sessionVersion divergente). */
  revoked: boolean;
};

const loadSessionUser = cache(async (userId: string) => {
  return db.query.users.findFirst({
    where: eq(users.id, userId),
    with: { userPermissions: { columns: { permission: true } } },
  });
});

export const getSessionState = cache(async (): Promise<SessionState> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return { session: null, revoked: false };

  const payload = await verifySessionToken(token);
  if (!payload) return { session: null, revoked: false };

  const user = await loadSessionUser(payload.userId);
  if (!isSessionUserValid(payload, user)) {
    return { session: null, revoked: true };
  }

  return {
    session: {
      userId: user!.id,
      name: user!.name,
      email: user!.email,
      cargo: user!.cargo,
      permissions: effectivePermissions(
        user!.cargo,
        user!.userPermissions.map((p) => p.permission),
      ),
    },
    revoked: false,
  };
});

/** Sessão atual validada contra o banco (server components / actions / routes). */
export async function getSession(): Promise<SessionPayload | null> {
  return (await getSessionState()).session;
}
