import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { RoleName } from "@/db/schema";

// Camada de token/cookie da sessão. Este arquivo é importado pelo proxy (edge)
// e por isso NÃO pode importar o driver do banco — a validação contra o banco
// (status, papéis, sessionVersion) fica em ./session-server.ts.

export const SESSION_COOKIE = "cop_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8h

/**
 * Payload do JWT: mínimo possível. Papéis, nome e e-mail são reconsultados do
 * banco a cada request (ver session-server.ts) — o token não carrega dados que
 * possam ficar obsoletos. `sv` = users.sessionVersion no momento do login;
 * qualquer mudança de papéis/status incrementa a coluna e invalida o token.
 */
export type TokenPayload = {
  userId: string;
  sv: number;
};

/** Sessão hidratada do banco — o que o restante do app consome. */
export type SessionPayload = {
  userId: string;
  name: string;
  email: string;
  roles: RoleName[];
};

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET ausente ou muito curto (gere com: openssl rand -base64 48)");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(payload: TokenPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function verifySessionToken(
  token: string,
): Promise<(TokenPayload & { exp?: number; iat?: number }) | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (typeof payload.userId !== "string" || typeof payload.sv !== "number") return null;
    return payload as unknown as TokenPayload & { exp?: number; iat?: number };
  } catch {
    return null;
  }
}

/**
 * Regra única de validade da sessão contra o estado atual do usuário no banco.
 * Pura (testável sem banco): usada por session-server.ts a cada request.
 */
export function isSessionUserValid(
  token: TokenPayload,
  user:
    | { id: string; isActive: boolean; status: string; sessionVersion: number }
    | null
    | undefined,
): boolean {
  if (!user) return false;
  if (user.id !== token.userId) return false;
  if (!user.isActive || user.status !== "ATIVO") return false;
  if (user.sessionVersion !== token.sv) return false;
  return true;
}

export async function setSessionCookie(payload: TokenPayload): Promise<void> {
  const token = await createSessionToken(payload);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
