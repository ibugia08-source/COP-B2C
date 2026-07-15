import type { CargoName } from "@/db/schema";

// ---------------------------------------------------------------------------
// Catálogo de permissões (RBAC 2.0) — fonte ÚNICA de verdade.
// Formato "modulo.acao". A variante "_all" indica escopo amplo (qualquer
// entidade) vs. a chave-base (apenas as próprias/atribuídas). Toda ação do
// sistema é representável aqui e concedível individualmente pelo Admin Geral.
// ---------------------------------------------------------------------------

export const PERMISSION_KEYS = [
  // Dashboard
  "dashboard.view_global", // métricas globais + carga da equipe (visão gerencial)
  // Clientes e Operação
  "clients.view",
  "clients.create",
  "clients.update",
  "clients.update_all",
  "clients.delete",
  "clients.delete_all",
  "clients.moveStatus",
  "clients.moveStatus_all",
  "clients.manage_owners",
  // Tarefas
  "tasks.view",
  "tasks.create",
  "tasks.assign",
  "tasks.update",
  "tasks.update_all",
  "tasks.complete",
  "tasks.complete_all",
  "tasks.reopen",
  "tasks.reopen_all",
  "tasks.delete",
  "tasks.delete_all",
  "tasks.manage_templates",
  // Documentos
  "documents.view",
  "documents.access_all", // ver/baixar QUALQUER documento (ignora escopo por cliente)
  "documents.create",
  "documents.update",
  "documents.update_all",
  "documents.delete",
  "documents.delete_all",
  // Banco de Ativos Digitais
  "digital_assets.view",
  "digital_assets.access_all", // operar QUALQUER ativo, incl. internos da agência
  "digital_assets.create",
  "digital_assets.update",
  "digital_assets.archive",
  "digital_assets.delete",
  "digital_assets.view_secrets_metadata",
  "digital_assets.reveal_secrets",
  "digital_assets.reveal_restricted_secrets", // tokens, API keys e 2FA
  "digital_assets.copy_secrets",
  "digital_assets.create_secrets",
  "digital_assets.update_secrets",
  "digital_assets.delete_secrets",
  "digital_assets.upload_attachments",
  "digital_assets.download_attachments",
  "digital_assets.view_audit_logs",
  "digital_assets.manage_groups",
  // Formulários
  "forms.view",
  "forms.submit",
  "forms.view_submissions",
  "forms.manage_templates",
  // Metas
  "goals.view",
  "goals.create",
  "goals.update",
  "goals.delete",
  // Automações
  "automations.view",
  "automations.create",
  "automations.update",
  "automations.delete",
  // Equipe e gestão de acessos
  "team.view",
  "team.create",
  "team.update",
  "team.approve",
  "team.deactivate",
  "team.delete",
  "team.change_role",
  "team.grant_permissions",
  "team.view_permissions",
  // Configurações / infraestrutura
  "settings.view",
  "settings.update",
  "integrations.manage",
  "services.manage",
  "audit.view",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

const ALL = [...PERMISSION_KEYS] as PermissionKey[];
const KEY_SET = new Set<string>(PERMISSION_KEYS);

export function isPermissionKey(value: string): value is PermissionKey {
  return KEY_SET.has(value);
}

// ---------------------------------------------------------------------------
// Escopo próprio × amplo ("_all")
// ---------------------------------------------------------------------------

/** Se a chave termina em "_all", devolve a chave-base; senão null. */
export function baseOfAll(key: string): PermissionKey | null {
  if (!key.endsWith("_all")) return null;
  const base = key.slice(0, -"_all".length);
  return isPermissionKey(base) ? (base as PermissionKey) : null;
}

/** Variante ampla de uma chave-base, se existir no catálogo. */
export function allVariantOf(key: PermissionKey): PermissionKey | null {
  const candidate = `${key}_all`;
  return isPermissionKey(candidate) ? (candidate as PermissionKey) : null;
}

// ---------------------------------------------------------------------------
// Metadados por permissão (feature, rótulo, risco) — usados na tela de Equipe
// ---------------------------------------------------------------------------

export const FEATURES = [
  "dashboard",
  "clients",
  "tasks",
  "documents",
  "digital_assets",
  "forms",
  "goals",
  "automations",
  "team",
  "settings",
] as const;
export type Feature = (typeof FEATURES)[number];

export const FEATURE_LABELS: Record<Feature, string> = {
  dashboard: "Dashboard",
  clients: "Clientes e Operação",
  tasks: "Tarefas",
  documents: "Documentos",
  digital_assets: "Banco de Ativos",
  forms: "Formulários",
  goals: "Metas",
  automations: "Automações",
  team: "Equipe e acessos",
  settings: "Configurações",
};

type Risk = "low" | "medium" | "high";

export type PermissionMeta = {
  feature: Feature;
  label: string;
  risk: Risk;
  /** Só o Administrador Geral pode conceder esta permissão como extra (teto). */
  adminOnlyGrant?: boolean;
};

export const PERMISSION_META: Record<PermissionKey, PermissionMeta> = {
  "dashboard.view_global": { feature: "dashboard", label: "Ver métricas globais e carga da equipe", risk: "medium" },

  "clients.view": { feature: "clients", label: "Ver clientes", risk: "low" },
  "clients.create": { feature: "clients", label: "Criar clientes", risk: "medium" },
  "clients.update": { feature: "clients", label: "Editar clientes próprios", risk: "medium" },
  "clients.update_all": { feature: "clients", label: "Editar QUALQUER cliente", risk: "high" },
  "clients.delete": { feature: "clients", label: "Excluir clientes próprios", risk: "high" },
  "clients.delete_all": { feature: "clients", label: "Excluir QUALQUER cliente", risk: "high" },
  "clients.moveStatus": { feature: "clients", label: "Mover etapa dos clientes próprios", risk: "medium" },
  "clients.moveStatus_all": { feature: "clients", label: "Mover etapa de QUALQUER cliente", risk: "high" },
  "clients.manage_owners": { feature: "clients", label: "Gerenciar responsáveis do cliente", risk: "medium" },

  "tasks.view": { feature: "tasks", label: "Ver tarefas", risk: "low" },
  "tasks.create": { feature: "tasks", label: "Criar tarefas", risk: "low" },
  "tasks.assign": { feature: "tasks", label: "Atribuir tarefas", risk: "low" },
  "tasks.update": { feature: "tasks", label: "Editar tarefas próprias", risk: "low" },
  "tasks.update_all": { feature: "tasks", label: "Editar QUALQUER tarefa", risk: "medium" },
  "tasks.complete": { feature: "tasks", label: "Concluir tarefas próprias", risk: "low" },
  "tasks.complete_all": { feature: "tasks", label: "Concluir QUALQUER tarefa", risk: "medium" },
  "tasks.reopen": { feature: "tasks", label: "Reabrir tarefas próprias", risk: "low" },
  "tasks.reopen_all": { feature: "tasks", label: "Reabrir QUALQUER tarefa", risk: "medium" },
  "tasks.delete": { feature: "tasks", label: "Excluir tarefas próprias", risk: "medium" },
  "tasks.delete_all": { feature: "tasks", label: "Excluir QUALQUER tarefa", risk: "high" },
  "tasks.manage_templates": { feature: "tasks", label: "Gerenciar templates de tarefa", risk: "medium" },

  "documents.view": { feature: "documents", label: "Ver documentos (dos seus clientes)", risk: "low" },
  "documents.access_all": { feature: "documents", label: "Ver/baixar QUALQUER documento", risk: "high" },
  "documents.create": { feature: "documents", label: "Criar documentos", risk: "low" },
  "documents.update": { feature: "documents", label: "Editar documentos próprios", risk: "low" },
  "documents.update_all": { feature: "documents", label: "Editar QUALQUER documento", risk: "medium" },
  "documents.delete": { feature: "documents", label: "Excluir documentos próprios", risk: "medium" },
  "documents.delete_all": { feature: "documents", label: "Excluir QUALQUER documento", risk: "high" },

  "digital_assets.view": { feature: "digital_assets", label: "Ver ativos (dos seus clientes)", risk: "low" },
  "digital_assets.access_all": { feature: "digital_assets", label: "Operar QUALQUER ativo (incl. internos)", risk: "high" },
  "digital_assets.create": { feature: "digital_assets", label: "Criar ativos", risk: "medium" },
  "digital_assets.update": { feature: "digital_assets", label: "Editar ativos", risk: "medium" },
  "digital_assets.archive": { feature: "digital_assets", label: "Arquivar ativos", risk: "low" },
  "digital_assets.delete": { feature: "digital_assets", label: "Excluir ativos", risk: "high" },
  "digital_assets.view_secrets_metadata": { feature: "digital_assets", label: "Ver metadados de segredos", risk: "medium" },
  "digital_assets.reveal_secrets": { feature: "digital_assets", label: "Revelar segredos", risk: "high" },
  "digital_assets.reveal_restricted_secrets": { feature: "digital_assets", label: "Revelar tokens/API keys/2FA", risk: "high", adminOnlyGrant: true },
  "digital_assets.copy_secrets": { feature: "digital_assets", label: "Copiar segredos", risk: "high" },
  "digital_assets.create_secrets": { feature: "digital_assets", label: "Criar segredos", risk: "high", adminOnlyGrant: true },
  "digital_assets.update_secrets": { feature: "digital_assets", label: "Editar segredos", risk: "high", adminOnlyGrant: true },
  "digital_assets.delete_secrets": { feature: "digital_assets", label: "Excluir segredos", risk: "high", adminOnlyGrant: true },
  "digital_assets.upload_attachments": { feature: "digital_assets", label: "Enviar anexos/criativos", risk: "low" },
  "digital_assets.download_attachments": { feature: "digital_assets", label: "Baixar anexos/criativos", risk: "low" },
  "digital_assets.view_audit_logs": { feature: "digital_assets", label: "Ver auditoria de ativos", risk: "medium" },
  "digital_assets.manage_groups": { feature: "digital_assets", label: "Gerenciar grupos de ativos", risk: "medium" },

  "forms.view": { feature: "forms", label: "Ver formulários", risk: "low" },
  "forms.submit": { feature: "forms", label: "Responder formulários internos", risk: "low" },
  "forms.view_submissions": { feature: "forms", label: "Ver respostas de formulários", risk: "medium" },
  "forms.manage_templates": { feature: "forms", label: "Gerenciar modelos de formulário", risk: "medium" },

  "goals.view": { feature: "goals", label: "Ver metas", risk: "low" },
  "goals.create": { feature: "goals", label: "Criar metas", risk: "low" },
  "goals.update": { feature: "goals", label: "Editar metas", risk: "low" },
  "goals.delete": { feature: "goals", label: "Excluir metas", risk: "medium" },

  "automations.view": { feature: "automations", label: "Ver automações", risk: "low" },
  "automations.create": { feature: "automations", label: "Criar automações", risk: "medium" },
  "automations.update": { feature: "automations", label: "Editar automações", risk: "medium" },
  "automations.delete": { feature: "automations", label: "Excluir automações", risk: "medium" },

  "team.view": { feature: "team", label: "Ver equipe", risk: "medium", adminOnlyGrant: true },
  "team.create": { feature: "team", label: "Criar colaboradores", risk: "high", adminOnlyGrant: true },
  "team.update": { feature: "team", label: "Editar colaboradores", risk: "high", adminOnlyGrant: true },
  "team.approve": { feature: "team", label: "Aprovar cadastros", risk: "high", adminOnlyGrant: true },
  "team.deactivate": { feature: "team", label: "Desativar colaboradores", risk: "high", adminOnlyGrant: true },
  "team.delete": { feature: "team", label: "Excluir colaboradores", risk: "high", adminOnlyGrant: true },
  "team.change_role": { feature: "team", label: "Alterar cargo", risk: "high", adminOnlyGrant: true },
  "team.grant_permissions": { feature: "team", label: "Conceder/remover permissões extras", risk: "high", adminOnlyGrant: true },
  "team.view_permissions": { feature: "team", label: "Ver permissões de outros", risk: "medium", adminOnlyGrant: true },

  "settings.view": { feature: "settings", label: "Ver configurações", risk: "low", adminOnlyGrant: true },
  "settings.update": { feature: "settings", label: "Alterar configurações", risk: "high", adminOnlyGrant: true },
  "integrations.manage": { feature: "settings", label: "Gerenciar integrações", risk: "high", adminOnlyGrant: true },
  "services.manage": { feature: "settings", label: "Gerenciar serviços/flags", risk: "high", adminOnlyGrant: true },
  "audit.view": { feature: "settings", label: "Ver auditoria de acessos", risk: "medium", adminOnlyGrant: true },
};

/** Permissões que só o Administrador Geral pode conceder como extra (teto). */
export const ADMIN_ONLY_GRANT: Set<PermissionKey> = new Set(
  ALL.filter((k) => PERMISSION_META[k].adminOnlyGrant),
);

// Tipos de segredo cuja revelação exige `digital_assets.reveal_restricted_secrets`
// (tokens, chaves de API e 2FA). `reveal_secrets` sozinho não os revela.
export const RESTRICTED_SECRET_TYPES = ["TOKEN", "API_KEY", "TWO_FACTOR_SECRET"] as const;

// ---------------------------------------------------------------------------
// Cargos e pacotes PADRÃO (no código, tipados). O Admin Geral concede extras.
// ---------------------------------------------------------------------------

export const CARGO_LABELS: Record<CargoName, string> = {
  ADMINISTRADOR_GERAL: "Administrador Geral",
  GESTOR_TRAFEGO: "Gestor de Tráfego",
  SOCIAL_MEDIA: "Social Media",
  DIRETOR_CRIATIVO: "Diretor Criativo",
  COMERCIAL: "Comercial",
  DESIGNER: "Designer",
};

// Base universal: TODO cargo vê todos os clientes e todas as tarefas, cria e
// atribui tarefas, e mexe nas próprias (requisito do projeto).
const BASE: PermissionKey[] = [
  "clients.view",
  "tasks.view",
  "tasks.create",
  "tasks.assign",
  "tasks.update",
  "tasks.complete",
  "tasks.reopen",
  "goals.view",
  "digital_assets.view",
  "documents.view",
  "forms.view",
  "forms.submit",
];

function pkg(...extra: PermissionKey[]): PermissionKey[] {
  return [...new Set([...BASE, ...extra])];
}

export const CARGO_DEFAULT_PERMISSIONS: Record<CargoName, PermissionKey[]> = {
  // Acesso total (acima do teto). Único que concede permissões e mexe em acessos.
  ADMINISTRADOR_GERAL: ALL,
  // Gestor de Tráfego: rotina completa de tráfego + ativos com revelação de
  // segredos (inclui pacote operacional herdado dos usuários migrados).
  GESTOR_TRAFEGO: pkg(
    "clients.create",
    "clients.update",
    "clients.moveStatus",
    "clients.manage_owners",
    "tasks.delete",
    "tasks.manage_templates",
    "digital_assets.create",
    "digital_assets.update",
    "digital_assets.archive",
    "digital_assets.manage_groups",
    "digital_assets.view_secrets_metadata",
    "digital_assets.reveal_secrets",
    "digital_assets.reveal_restricted_secrets",
    "digital_assets.copy_secrets",
    "digital_assets.create_secrets",
    "digital_assets.update_secrets",
    "digital_assets.upload_attachments",
    "digital_assets.download_attachments",
    "documents.create",
    "documents.update",
    "goals.create",
    "goals.update",
    "automations.view",
    "forms.view_submissions",
  ),
  // Social Media: ativos e revelação de segredos das redes (tokens/API/2FA
  // ficam de fora — exige a permissão restrita).
  SOCIAL_MEDIA: pkg(
    "digital_assets.view_secrets_metadata",
    "digital_assets.reveal_secrets",
    "digital_assets.upload_attachments",
    "digital_assets.download_attachments",
    "documents.create",
    "documents.update",
  ),
  // Diretor Criativo: líder da criação — gestão TOTAL das tarefas do time.
  DIRETOR_CRIATIVO: pkg(
    "tasks.update_all",
    "tasks.complete_all",
    "tasks.reopen_all",
    "tasks.delete",
    "tasks.delete_all",
    "tasks.manage_templates",
    "digital_assets.view_secrets_metadata",
    "digital_assets.upload_attachments",
    "digital_assets.download_attachments",
    "documents.create",
    "documents.update",
  ),
  // Comercial: prospecção e cadastro de clientes.
  COMERCIAL: pkg(
    "clients.create",
    "clients.update",
    "clients.moveStatus",
    "documents.create",
  ),
  // Designer: perfil enxuto — tarefas + baixar criativos.
  DESIGNER: pkg("digital_assets.download_attachments"),
};

/** Pacote padrão do cargo (vazio se cargo nulo/desconhecido). */
export function cargoDefaultPermissions(cargo: CargoName | null | undefined): PermissionKey[] {
  if (!cargo) return [];
  return CARGO_DEFAULT_PERMISSIONS[cargo] ?? [];
}

/**
 * Permissões efetivas = padrão do cargo ∪ extras concedidas (grant-only).
 * `extras` são filtradas contra o catálogo (ignora chaves órfãs).
 */
export function effectivePermissions(
  cargo: CargoName | null | undefined,
  extras: readonly string[] = [],
): PermissionKey[] {
  const set = new Set<PermissionKey>(cargoDefaultPermissions(cargo));
  for (const e of extras) if (isPermissionKey(e)) set.add(e);
  return [...set];
}
