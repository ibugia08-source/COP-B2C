// Rate limiting do login: lógica pura (testável sem banco). A contagem de
// tentativas vem da tabela login_attempts; a decisão de bloquear fica aqui.

export const LOGIN_RATE_LIMIT = {
  /** Janela de contagem de falhas (e duração do bloqueio). */
  windowMs: 15 * 60_000,
  /** Falhas por e-mail dentro da janela antes de bloquear. */
  maxEmailFailures: 5,
  /** Falhas por IP dentro da janela antes de bloquear. */
  maxIpFailures: 20,
  /** Registros mais antigos que isso são removidos oportunisticamente. */
  retentionMs: 7 * 24 * 3600_000,
} as const;

export type LoginAttemptLike = { success: boolean; createdAt: Date };

/** Conta falhas dentro da janela (ignora sucessos e registros antigos). */
export function countRecentFailures(
  attempts: readonly LoginAttemptLike[],
  now: Date = new Date(),
  windowMs: number = LOGIN_RATE_LIMIT.windowMs,
): number {
  const cutoff = now.getTime() - windowMs;
  return attempts.filter((a) => !a.success && a.createdAt.getTime() >= cutoff).length;
}

export type RateLimitVerdict = { blocked: boolean; reason?: "email" | "ip" };

/** Decisão de bloqueio a partir das contagens de falhas na janela. */
export function assessLoginRateLimit(input: {
  emailFailures: number;
  ipFailures: number;
}): RateLimitVerdict {
  if (input.emailFailures > LOGIN_RATE_LIMIT.maxEmailFailures) {
    return { blocked: true, reason: "email" };
  }
  if (input.ipFailures > LOGIN_RATE_LIMIT.maxIpFailures) {
    return { blocked: true, reason: "ip" };
  }
  return { blocked: false };
}

/** Mensagem genérica — não revela se a conta existe nem o motivo exato. */
export const RATE_LIMIT_MESSAGE = "Muitas tentativas. Tente novamente em alguns minutos.";
