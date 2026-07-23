import type { PermissionKey } from "@/lib/auth/permissions";

// Catálogo das métricas operacionais permitidas no Dashboard.
// (Removidas do produto: "Segredos revelados" e "Clientes por nicho".)

export const METRIC_KEYS = [
  "clientes_ativos",
  "clientes_criticos",
  "clientes_observacao",
  "clientes_ads_pausado",
  "tarefas_atrasadas",
  "tarefas_sem_responsavel",
  "minhas_tarefas_pendentes",
  "minhas_tarefas_atrasadas",
  "solicitacoes_pendentes",
  "ativos_total",
  "ativos_bloqueados",
  "ativos_prontos",
  "ativos_precisa_documentos",
  "ativos_esquentando",
  "ativos_revisao_pendente",
  "metas_andamento",
  "metas_prazo",
  "alertas_operacionais",
] as const;

export type MetricKey = (typeof METRIC_KEYS)[number];

export type MetricCategory = "Clientes" | "Tarefas" | "Ativos digitais" | "Metas" | "Alertas";

export type MetricDef = {
  key: MetricKey;
  label: string;
  category: MetricCategory;
  tone: string;
  href?: string;
  hint?: string;
  // permissão necessária para ver a métrica (ausente = qualquer usuário logado)
  permission?: PermissionKey;
  // true = métrica pessoal (contexto do próprio usuário)
  personal?: boolean;
  // true = alerta prioritário (campo visibleAlerts)
  alert?: boolean;
};

export const METRIC_CATALOG: MetricDef[] = [
  { key: "clientes_ativos", label: "Clientes ativos", category: "Clientes", tone: "text-emerald-400", href: "/operacao?modo=clientes&status=ATIVO", permission: "clients.view" },
  { key: "clientes_criticos", label: "Clientes críticos", category: "Clientes", tone: "text-red-400", href: "/operacao?modo=clientes&saude=CRITICO", permission: "clients.view", alert: true },
  { key: "clientes_observacao", label: "Clientes em observação", category: "Clientes", tone: "text-amber-400", href: "/operacao?modo=clientes&saude=OBSERVACAO", permission: "clients.view" },
  { key: "clientes_ads_pausado", label: "Clientes com ads pausado", category: "Clientes", tone: "text-amber-400", href: "/operacao?modo=clientes&ads=PAUSADO", permission: "clients.view", alert: true },
  { key: "tarefas_atrasadas", label: "Tarefas atrasadas", category: "Tarefas", tone: "text-red-400", href: "/tarefas?prazo=atrasadas", permission: "tasks.view", alert: true },
  { key: "tarefas_sem_responsavel", label: "Tarefas sem responsável", category: "Tarefas", tone: "text-amber-400", href: "/tarefas?responsavel=__none__&status=__abertas__", permission: "tasks.view", alert: true },
  { key: "minhas_tarefas_pendentes", label: "Minhas tarefas pendentes", category: "Tarefas", tone: "text-sky-400", href: "/tarefas?responsavel=__me__&status=__abertas__", permission: "tasks.view", personal: true },
  { key: "minhas_tarefas_atrasadas", label: "Minhas tarefas atrasadas", category: "Tarefas", tone: "text-red-400", href: "/tarefas?responsavel=__me__&prazo=atrasadas", permission: "tasks.view", personal: true, alert: true },
  { key: "solicitacoes_pendentes", label: "Solicitações pendentes", category: "Alertas", tone: "text-amber-400", href: "/equipe", permission: "team.approve", hint: "acessos aguardando aprovação", alert: true },
  { key: "ativos_total", label: "Ativos digitais cadastrados", category: "Ativos digitais", tone: "text-sky-400", href: "/ativos", permission: "digital_assets.view" },
  { key: "ativos_bloqueados", label: "Ativos bloqueados", category: "Ativos digitais", tone: "text-red-400", href: "/ativos?status=BLOQUEADA", permission: "digital_assets.view", alert: true },
  { key: "ativos_prontos", label: "Ativos prontos para uso", category: "Ativos digitais", tone: "text-emerald-400", href: "/ativos?status=PRONTA_PARA_USO", permission: "digital_assets.view" },
  { key: "ativos_precisa_documentos", label: "Ativos precisando de documentos", category: "Ativos digitais", tone: "text-amber-400", href: "/ativos?status=PRECISA_DE_DOCUMENTOS", permission: "digital_assets.view", alert: true },
  { key: "ativos_esquentando", label: "Ativos sendo esquentados", category: "Ativos digitais", tone: "text-amber-400", href: "/ativos?status=SENDO_ESQUENTADA", permission: "digital_assets.view" },
  { key: "ativos_revisao_pendente", label: "Revisões pendentes de ativos", category: "Ativos digitais", tone: "text-purple-400", href: "/ativos?revisao=pendente", permission: "digital_assets.view", alert: true },
  { key: "metas_andamento", label: "Metas em andamento", category: "Metas", tone: "text-sky-400", href: "/metas", permission: "goals.view" },
  { key: "metas_prazo", label: "Metas próximas do prazo", category: "Metas", tone: "text-amber-400", href: "/metas", permission: "goals.view", alert: true },
  { key: "alertas_operacionais", label: "Alertas operacionais", category: "Alertas", tone: "text-red-400", href: "/operacao", permission: "clients.view", hint: "pendências que exigem ação", alert: true },
];

export const METRIC_BY_KEY: Record<MetricKey, MetricDef> = Object.fromEntries(
  METRIC_CATALOG.map((m) => [m.key, m]),
) as Record<MetricKey, MetricDef>;

// Conjunto padrão (built-in) exibido quando o usuário não personalizou nada.
export const BUILTIN_DEFAULT_METRICS: MetricKey[] = [
  "clientes_ativos",
  "clientes_criticos",
  "tarefas_atrasadas",
  "minhas_tarefas_pendentes",
  "minhas_tarefas_atrasadas",
  "ativos_bloqueados",
  "ativos_revisao_pendente",
  "alertas_operacionais",
];

export function isValidMetricKey(key: string): key is MetricKey {
  return (METRIC_KEYS as readonly string[]).includes(key);
}
