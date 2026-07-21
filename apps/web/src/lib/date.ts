// Datas-only (sem hora) — data de entrada, churn, prazos, período de metas etc.
// São representadas como string 'YYYY-MM-DD' de ponta a ponta: formulário → API →
// banco (coluna `date`) → tela.
//
// REGRA DE OURO: NUNCA faça `new Date('2026-07-17')` numa data-only. Uma string
// data-only é parseada como MEIA-NOITE UTC; formatada em um fuso atrás do UTC
// (Brasil, UTC-3) ela escorrega para o dia anterior/seguinte. As funções abaixo
// não passam por Date ao parsear/formatar — por isso o dia nunca muda.

const TZ = "America/Sao_Paulo";

/** 'YYYY-MM-DD' -> '17/07/2026'. Sem Date, sem fuso. */
export function formatDateOnly(d: string | null | undefined): string {
  if (!d) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
}

/** Data de hoje no fuso do Brasil, como 'YYYY-MM-DD'. Usa o instante atual (ok). */
export function todayDateOnly(): string {
  // 'en-CA' formata como 'YYYY-MM-DD'.
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

/** Um instante real (Date) -> 'YYYY-MM-DD' no fuso do Brasil. */
export function toDateOnly(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

/**
 * Vencida em relação a hoje (Brasil)? Comparação lexicográfica de 'YYYY-MM-DD'
 * equivale à cronológica.
 */
export function isDateOnlyOverdue(d: string | null | undefined): boolean {
  return !!d && d < todayDateOnly();
}

/**
 * Soma (ou subtrai) dias a uma data-only, retornando 'YYYY-MM-DD'. Constrói e lê
 * em UTC — como só há data (sem hora), não há risco de fuso/DST.
 */
export function addDaysDateOnly(d: string, days: number): string {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day + days)).toISOString().slice(0, 10);
}

/**
 * 'YYYY-MM-DD' -> Date LOCAL à meia-noite do dia. Use apenas quando um componente
 * exige um Date (ex.: bucketing do calendário por getDate/getMonth locais). Como
 * é meia-noite LOCAL (não UTC), o dia do calendário não escorrega.
 */
export function dateOnlyToLocalDate(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day);
}
