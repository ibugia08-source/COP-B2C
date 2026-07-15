// Rate-limit em memória (por instância) — best-effort, SEM tabela nova.
// Adequado para endpoints públicos de baixo volume (ex.: formulários públicos).
// Limitação conhecida: em serverless a memória é por instância, então o limite
// é aproximado sob múltiplas instâncias — ainda assim adiciona atrito real
// contra flood de uma única origem, junto do honeypot.

type Bucket = number[]; // timestamps (ms) das requisições recentes
const buckets = new Map<string, Bucket>();

export type RateLimitResult = { allowed: boolean; retryAfterMs: number };

/**
 * Janela deslizante: permite no máximo `max` eventos por `windowMs` para a
 * `key`. Lógica pura (recebe `now`) para ser testável.
 */
export function checkMemoryRateLimit(
  key: string,
  max: number,
  windowMs: number,
  now: number,
): RateLimitResult {
  const cutoff = now - windowMs;
  const hits = (buckets.get(key) ?? []).filter((t) => t >= cutoff);

  if (hits.length >= max) {
    buckets.set(key, hits);
    return { allowed: false, retryAfterMs: hits[0] + windowMs - now };
  }

  hits.push(now);
  buckets.set(key, hits);

  // limpeza oportunista para não crescer indefinidamente
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      const kept = v.filter((t) => t >= cutoff);
      if (kept.length === 0) buckets.delete(k);
      else buckets.set(k, kept);
    }
  }

  return { allowed: true, retryAfterMs: 0 };
}
