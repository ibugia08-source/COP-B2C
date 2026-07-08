import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  ADS_STATUSES,
  ASSET_PLATFORMS,
  ASSET_STATUSES,
  ASSET_TYPES,
  AGENCY_BRANDS,
  BUSINESS_MODELS,
  CLIENT_STATUSES,
  clients as clientsTable,
  configOptionGroups,
  configOptions,
  GOAL_CATEGORIES,
  HEALTH_STATUSES,
  PIPELINE_STAGES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_TYPES,
} from "@/db/schema";
import {
  ADS_META,
  AGENCY_BRAND_META,
  ASSET_PLATFORM_LABEL,
  ASSET_STATUS_META,
  ASSET_TYPE_LABEL,
  BUSINESS_MODEL_LABEL,
  CLIENT_STATUS_META,
  HEALTH_META,
  PIPELINE_STAGE_META,
  PRIORITY_META,
  TASK_STATUS_META,
  TASK_TYPE_META,
  type Tone,
} from "@/lib/labels";

export type ModuleKey = "clients" | "tasks" | "operation" | "digital_assets" | "goals";

export type BuiltinOption = { value: string; label: string; color: Tone };
export type BuiltinGroup = {
  moduleKey: ModuleKey;
  groupKey: string;
  name: string;
  isSystem: boolean; // system = valores travados na lógica de negócio
  options: BuiltinOption[];
  // qual campo do banco a opção controla, para checar uso antes de excluir
  usage?: { table: string; column: string };
};

// Constrói opções a partir de um enum + mapa de metadados
function fromMeta(values: readonly string[], meta: Record<string, { label: string; tone: Tone }>): BuiltinOption[] {
  return values.map((v) => ({ value: v, label: meta[v]?.label ?? v, color: meta[v]?.tone ?? "zinc" }));
}
function fromLabels(values: readonly string[], labels: Record<string, string>, color: Tone = "blue"): BuiltinOption[] {
  return values.map((v) => ({ value: v, label: labels[v] ?? v, color }));
}

// Registro de todos os grupos configuráveis do sistema, com seus padrões.
export const BUILTIN_GROUPS: BuiltinGroup[] = [
  // Clientes
  { moduleKey: "clients", groupKey: "status", name: "Status do cliente", isSystem: true, options: fromMeta(CLIENT_STATUSES, CLIENT_STATUS_META), usage: { table: "clients", column: "status" } },
  { moduleKey: "clients", groupKey: "health", name: "Saúde da conta", isSystem: true, options: fromMeta(HEALTH_STATUSES, HEALTH_META), usage: { table: "clients", column: "health_status" } },
  { moduleKey: "clients", groupKey: "ads_status", name: "Status de anúncios", isSystem: true, options: fromMeta(ADS_STATUSES, ADS_META), usage: { table: "clients", column: "ads_status" } },
  { moduleKey: "clients", groupKey: "agency_brand", name: "Empresas / marcas", isSystem: true, options: fromMeta(AGENCY_BRANDS, AGENCY_BRAND_META), usage: { table: "clients", column: "agency_brand" } },
  { moduleKey: "clients", groupKey: "business_model", name: "Modelos de negócio", isSystem: true, options: fromLabels(BUSINESS_MODELS, BUSINESS_MODEL_LABEL), usage: { table: "clients", column: "business_model" } },
  { moduleKey: "clients", groupKey: "niche", name: "Nichos", isSystem: false, options: [], usage: { table: "clients", column: "niche" } },
  // Tarefas
  { moduleKey: "tasks", groupKey: "status", name: "Status da tarefa", isSystem: true, options: fromMeta(TASK_STATUSES, TASK_STATUS_META), usage: { table: "tasks", column: "status" } },
  { moduleKey: "tasks", groupKey: "type", name: "Tipos de tarefa", isSystem: true, options: fromMeta(TASK_TYPES, TASK_TYPE_META), usage: { table: "tasks", column: "type" } },
  { moduleKey: "tasks", groupKey: "priority", name: "Prioridades", isSystem: true, options: fromMeta(TASK_PRIORITIES, PRIORITY_META), usage: { table: "tasks", column: "priority" } },
  { moduleKey: "tasks", groupKey: "tags", name: "Tags padrão", isSystem: false, options: [] },
  // Operação (pipeline)
  { moduleKey: "operation", groupKey: "pipeline", name: "Colunas do pipeline", isSystem: true, options: fromMeta(PIPELINE_STAGES, PIPELINE_STAGE_META), usage: { table: "clients", column: "pipeline_stage" } },
  // Banco de Ativos Digitais
  { moduleKey: "digital_assets", groupKey: "status", name: "Status dos ativos", isSystem: true, options: fromMeta(ASSET_STATUSES, ASSET_STATUS_META), usage: { table: "digital_assets", column: "status" } },
  { moduleKey: "digital_assets", groupKey: "type", name: "Tipos de ativo", isSystem: true, options: fromLabels(ASSET_TYPES, ASSET_TYPE_LABEL), usage: { table: "digital_assets", column: "asset_type" } },
  { moduleKey: "digital_assets", groupKey: "platform", name: "Plataformas", isSystem: true, options: fromLabels(ASSET_PLATFORMS, ASSET_PLATFORM_LABEL), usage: { table: "digital_assets", column: "platform" } },
  // Metas
  { moduleKey: "goals", groupKey: "category", name: "Categorias de meta", isSystem: true, options: fromLabels(GOAL_CATEGORIES, { CLIENTES: "Clientes", CHURN: "Churn", SATISFACAO: "Satisfação", COMERCIAL: "Comercial", OPERACIONAL: "Operacional" }) },
];

export function getBuiltinGroup(moduleKey: string, groupKey: string): BuiltinGroup | undefined {
  return BUILTIN_GROUPS.find((g) => g.moduleKey === moduleKey && g.groupKey === groupKey);
}

export type ResolvedOption = {
  id: string | null; // null quando vem só do built-in (ainda não persistido)
  value: string;
  label: string;
  color: Tone;
  order: number;
  isActive: boolean;
  isSystem: boolean;
};

/**
 * Resolve as opções de um grupo: mescla o que está salvo no banco sobre o
 * built-in. Se o grupo nunca foi tocado pelo admin, devolve o padrão — então
 * nada quebra mesmo sem seed.
 */
export async function resolveOptions(
  moduleKey: string,
  groupKey: string,
  opts: { activeOnly?: boolean } = {},
): Promise<ResolvedOption[]> {
  const builtin = getBuiltinGroup(moduleKey, groupKey);
  const group = await db.query.configOptionGroups.findFirst({
    where: and(eq(configOptionGroups.moduleKey, moduleKey), eq(configOptionGroups.groupKey, groupKey)),
    with: { options: { orderBy: [asc(configOptions.order), asc(configOptions.label)] } },
  });

  let resolved: ResolvedOption[];
  if (group && group.options.length) {
    resolved = group.options.map((o) => ({
      id: o.id,
      value: o.value,
      label: o.label,
      color: (o.color as Tone) ?? "zinc",
      order: o.order,
      isActive: o.isActive,
      isSystem: o.isSystem,
    }));
  } else {
    resolved = (builtin?.options ?? []).map((o, i) => ({
      id: null,
      value: o.value,
      label: o.label,
      color: o.color,
      order: i,
      isActive: true,
      isSystem: builtin?.isSystem ?? false,
    }));
  }

  resolved.sort((a, b) => a.order - b.order);
  return opts.activeOnly ? resolved.filter((o) => o.isActive) : resolved;
}

/**
 * Materializa todos os grupos built-in no banco (idempotente). Usado no seed e
 * numa migração de dados. O grupo "niche" é populado a partir dos nichos já
 * existentes nos clientes.
 */
export async function materializeAllGroups(): Promise<{ groups: number; options: number }> {
  let groups = 0;
  let options = 0;
  for (const builtin of BUILTIN_GROUPS) {
    let group = await db.query.configOptionGroups.findFirst({
      where: and(
        eq(configOptionGroups.moduleKey, builtin.moduleKey),
        eq(configOptionGroups.groupKey, builtin.groupKey),
      ),
    });
    if (!group) {
      [group] = await db
        .insert(configOptionGroups)
        .values({
          moduleKey: builtin.moduleKey,
          groupKey: builtin.groupKey,
          name: builtin.name,
          isSystem: builtin.isSystem,
        })
        .returning();
      groups++;
    }

    const existing = await db.query.configOptions.findMany({ where: eq(configOptions.groupId, group.id) });
    if (existing.length > 0) continue;

    let opts = builtin.options;
    // niche: semear a partir dos nichos já cadastrados
    if (builtin.groupKey === "niche") {
      const rows = await db.selectDistinct({ niche: clientsTable.niche }).from(clientsTable);
      const niches = rows.map((r) => r.niche).filter((n): n is string => !!n).sort();
      opts = niches.map((n) => ({ value: n, label: n, color: "blue" as Tone }));
    }
    if (opts.length) {
      await db.insert(configOptions).values(
        opts.map((o, i) => ({
          groupId: group!.id,
          label: o.label,
          value: o.value,
          color: o.color,
          order: i,
          isActive: true,
          isSystem: builtin.isSystem,
        })),
      );
      options += opts.length;
    }
  }
  return { groups, options };
}

/** Mapa value → {label, tone} para alimentar StatusBadge/filtros. */
export async function resolveMeta(
  moduleKey: string,
  groupKey: string,
): Promise<Record<string, { label: string; tone: Tone }>> {
  const options = await resolveOptions(moduleKey, groupKey);
  return Object.fromEntries(options.map((o) => [o.value, { label: o.label, tone: o.color }]));
}
