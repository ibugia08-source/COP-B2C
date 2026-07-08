import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appSettings, userDashboardConfigs } from "@/db/schema";
import type { SessionPayload } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/guard";
import {
  BUILTIN_DEFAULT_METRICS,
  isValidMetricKey,
  METRIC_BY_KEY,
  type MetricKey,
} from "@/lib/dashboard-metrics";

export const DEFAULT_COLUMNS = 4;
const GLOBAL_DEFAULT_KEY = "default_dashboard";

export type ResolvedDashboard = {
  /** métricas visíveis, na ordem, já filtradas pela permissão do usuário */
  metrics: MetricKey[];
  columns: number;
  filters: { empresa?: string; gestor?: string; nicho?: string };
  /** true se veio de configuração salva do próprio usuário */
  personalized: boolean;
};

type StoredDefault = { visibleMetrics?: string[]; columns?: number };

function permitted(session: SessionPayload, keys: MetricKey[]): MetricKey[] {
  return keys.filter((k) => {
    const def = METRIC_BY_KEY[k];
    return def && (!def.permission || hasPermission(session, def.permission));
  });
}

/** Padrão global (definido por admin) ou o built-in. */
export async function getGlobalDefaultMetrics(): Promise<MetricKey[]> {
  const row = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, GLOBAL_DEFAULT_KEY),
  });
  const stored = (row?.value as StoredDefault | undefined)?.visibleMetrics;
  const keys = (stored ?? BUILTIN_DEFAULT_METRICS).filter(isValidMetricKey);
  return keys.length ? keys : BUILTIN_DEFAULT_METRICS;
}

export async function getGlobalDefaultColumns(): Promise<number> {
  const row = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, GLOBAL_DEFAULT_KEY),
  });
  return (row?.value as StoredDefault | undefined)?.columns ?? DEFAULT_COLUMNS;
}

/**
 * Resolve o dashboard efetivo do usuário:
 * config própria → padrão global (admin) → built-in. Sempre filtra por permissão,
 * então o dashboard nunca quebra mesmo sem configuração.
 */
export async function resolveDashboard(session: SessionPayload): Promise<ResolvedDashboard> {
  const config = await db.query.userDashboardConfigs.findFirst({
    where: eq(userDashboardConfigs.userId, session.userId),
  });

  if (config && Array.isArray(config.visibleMetrics)) {
    // ordena pela metricOrder salva; métricas fora da ordem vão ao fim
    const order = (config.metricOrder ?? []).filter(isValidMetricKey);
    const visible = config.visibleMetrics.filter(isValidMetricKey);
    const ordered = [
      ...order.filter((k) => visible.includes(k)),
      ...visible.filter((k) => !order.includes(k)),
    ];
    return {
      metrics: permitted(session, ordered),
      columns: config.layoutConfig?.columns ?? (await getGlobalDefaultColumns()),
      filters: {
        empresa: config.defaultFilters?.empresa,
        gestor: config.defaultFilters?.gestor,
        nicho: config.defaultFilters?.nicho,
      },
      personalized: true,
    };
  }

  const [metrics, columns] = await Promise.all([getGlobalDefaultMetrics(), getGlobalDefaultColumns()]);
  return { metrics: permitted(session, metrics), columns, filters: {}, personalized: false };
}
