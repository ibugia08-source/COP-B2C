"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { appSettings, userDashboardConfigs } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { getSession } from "@/lib/auth/session-server";
import { isAdminGeral } from "@/lib/auth/access";
import {
  BUILTIN_DEFAULT_METRICS,
  isValidMetricKey,
  METRIC_BY_KEY,
  type MetricKey,
} from "@/lib/dashboard-metrics";
import { DEFAULT_COLUMNS } from "@/lib/dashboard-config";

export type ActionState = { error?: string; success?: string };

const GLOBAL_DEFAULT_KEY = "default_dashboard";

/** Lê a config atual do usuário ou monta uma a partir dos defaults salvos. */
async function currentConfig(userId: string) {
  const config = await db.query.userDashboardConfigs.findFirst({
    where: eq(userDashboardConfigs.userId, userId),
  });
  if (config) {
    return {
      visible: (config.visibleMetrics ?? []).filter(isValidMetricKey),
      order: (config.metricOrder ?? []).filter(isValidMetricKey),
      columns: config.layoutConfig?.columns ?? DEFAULT_COLUMNS,
      filters: config.defaultFilters ?? {},
    };
  }
  // primeira personalização: parte do padrão global salvo (ou built-in)
  const row = await db.query.appSettings.findFirst({ where: eq(appSettings.key, GLOBAL_DEFAULT_KEY) });
  const stored = (row?.value as { visibleMetrics?: string[]; columns?: number } | undefined) ?? {};
  const base = (stored.visibleMetrics ?? BUILTIN_DEFAULT_METRICS).filter(isValidMetricKey);
  return { visible: base, order: base, columns: stored.columns ?? DEFAULT_COLUMNS, filters: {} };
}

async function persist(
  userId: string,
  next: { visible: MetricKey[]; order: MetricKey[]; columns: number; filters: Record<string, string> },
) {
  const alerts = next.visible.filter((k) => METRIC_BY_KEY[k]?.alert);
  await db
    .insert(userDashboardConfigs)
    .values({
      userId,
      visibleMetrics: next.visible,
      metricOrder: next.order,
      layoutConfig: { columns: next.columns },
      defaultFilters: next.filters,
      visibleAlerts: alerts,
    })
    .onConflictDoUpdate({
      target: userDashboardConfigs.userId,
      set: {
        visibleMetrics: next.visible,
        metricOrder: next.order,
        layoutConfig: { columns: next.columns },
        defaultFilters: next.filters,
        visibleAlerts: alerts,
        updatedAt: new Date(),
      },
    });
  revalidatePath("/");
}

export async function addMetric(key: string): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: "Sessão expirada." };
  if (!isValidMetricKey(key)) return { error: "Métrica inválida." };

  const cfg = await currentConfig(session.userId);
  if (cfg.visible.includes(key)) return { success: "Métrica já está no dashboard." };
  const visible = [...cfg.visible, key];
  const order = cfg.order.includes(key) ? cfg.order : [...cfg.order, key];
  await persist(session.userId, { ...cfg, visible, order });
  return { success: "Métrica adicionada." };
}

export async function setMetrics(keys: string[]): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: "Sessão expirada." };
  const valid = keys.filter(isValidMetricKey);
  const cfg = await currentConfig(session.userId);
  await persist(session.userId, { ...cfg, visible: valid, order: valid });
  return { success: "Métricas atualizadas." };
}

export async function setColumns(columns: number): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: "Sessão expirada." };
  const n = [2, 3, 4].includes(columns) ? columns : DEFAULT_COLUMNS;
  const cfg = await currentConfig(session.userId);
  await persist(session.userId, { ...cfg, columns: n });
  return { success: "Layout salvo." };
}

export async function saveDefaultFilters(filters: {
  empresa?: string;
  gestor?: string;
  nicho?: string;
}): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: "Sessão expirada." };
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(filters)) if (v) clean[k] = v;
  const cfg = await currentConfig(session.userId);
  await persist(session.userId, { ...cfg, filters: clean });
  return { success: "Filtros padrão salvos." };
}

/** Volta o dashboard do usuário ao padrão (remove a config própria). */
export async function restoreDefault(): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: "Sessão expirada." };
  await db.delete(userDashboardConfigs).where(eq(userDashboardConfigs.userId, session.userId));
  revalidatePath("/");
  return { success: "Dashboard restaurado ao padrão." };
}

// --------------------------- Ações de administrador ---------------------------

/** Admin: define o dashboard atual do usuário como padrão para novos usuários. */
export async function setGlobalDefault(): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: "Sessão expirada." };
  if (!isAdminGeral(session)) return { error: "Apenas o Administrador Geral pode definir o padrão global." };

  const cfg = await currentConfig(session.userId);
  await db
    .insert(appSettings)
    .values({
      key: GLOBAL_DEFAULT_KEY,
      value: { visibleMetrics: cfg.visible, columns: cfg.columns },
      updatedById: session.userId,
    })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: {
        value: { visibleMetrics: cfg.visible, columns: cfg.columns },
        updatedById: session.userId,
        updatedAt: new Date(),
      },
    });
  await logActivity({
    userId: session.userId,
    action: "dashboard.globalDefaultSet",
    entityType: "appSetting",
    metadata: { metrics: cfg.visible.length },
  });
  revalidatePath("/");
  return { success: "Este dashboard virou o padrão para novos usuários." };
}

/** Admin: restaura o padrão global para o built-in do sistema. */
export async function restoreGlobalDefault(): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: "Sessão expirada." };
  if (!isAdminGeral(session)) return { error: "Apenas o Administrador Geral pode restaurar o padrão global." };
  await db.delete(appSettings).where(eq(appSettings.key, GLOBAL_DEFAULT_KEY));
  await logActivity({
    userId: session.userId,
    action: "dashboard.globalDefaultRestored",
    entityType: "appSetting",
  });
  revalidatePath("/");
  return { success: "Padrão global restaurado ao original do sistema." };
}
