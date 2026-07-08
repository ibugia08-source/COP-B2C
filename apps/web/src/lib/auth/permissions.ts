import type { RoleName } from "@/db/schema";

// Fonte única de verdade das permissões. Usada pelo seed (para popular o banco)
// e pelo runtime (guards). Formato: "modulo.acao".

export const PERMISSION_KEYS = [
  // Clientes
  "clients.view",
  "clients.create",
  "clients.update",
  "clients.delete",
  "clients.moveStatus",
  // Tarefas
  "tasks.view",
  "tasks.create",
  "tasks.update",
  "tasks.delete",
  "tasks.assign",
  "tasks.complete",
  // Banco de Ativos Digitais
  "digital_assets.view",
  "digital_assets.create",
  "digital_assets.update",
  "digital_assets.archive",
  "digital_assets.delete",
  "digital_assets.view_secrets_metadata",
  "digital_assets.reveal_secrets",
  "digital_assets.copy_secrets",
  "digital_assets.create_secrets",
  "digital_assets.update_secrets",
  "digital_assets.delete_secrets",
  "digital_assets.upload_attachments",
  "digital_assets.download_attachments",
  "digital_assets.view_audit_logs",
  "digital_assets.manage_groups",
  // Equipe e gestão de acessos
  "team.view",
  "team.create",
  "team.update",
  "team.deactivate",
  "team.approve",
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
  // Configurações
  "settings.view",
  "settings.update",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

const ALL = [...PERMISSION_KEYS] as PermissionKey[];

export const ROLE_PERMISSIONS: Record<RoleName, PermissionKey[]> = {
  // Acesso total
  OWNER: ALL,
  // Quase total: não altera configurações críticas
  ADMIN: ALL.filter((p) => p !== "settings.update"),
  // Clientes, operação, tarefas e ativos — SEM módulo Equipe (só admins) e
  // sem revelar segredos (exige permissão explícita concedida por OWNER/ADMIN)
  GESTOR_OPERACIONAL: [
    "clients.view",
    "clients.create",
    "clients.update",
    "clients.moveStatus",
    "tasks.view",
    "tasks.create",
    "tasks.update",
    "tasks.delete",
    "tasks.assign",
    "tasks.complete",
    "goals.view",
    "goals.create",
    "goals.update",
    "digital_assets.view",
    "digital_assets.create",
    "digital_assets.update",
    "digital_assets.archive",
    "digital_assets.view_secrets_metadata",
    "digital_assets.create_secrets",
    "digital_assets.upload_attachments",
    "digital_assets.download_attachments",
    "digital_assets.manage_groups",
    "automations.view",
  ],
  // Clientes atribuídos, tarefas, criativos e ativos com revelação de segredos
  GESTOR_TRAFEGO: [
    "clients.view",
    "clients.update",
    "tasks.view",
    "tasks.create",
    "tasks.update",
    "tasks.complete",
    "digital_assets.view",
    "digital_assets.create",
    "digital_assets.update",
    "digital_assets.view_secrets_metadata",
    "digital_assets.reveal_secrets",
    "digital_assets.copy_secrets",
    "digital_assets.create_secrets",
    "digital_assets.update_secrets",
    "digital_assets.upload_attachments",
    "digital_assets.download_attachments",
    "goals.view",
  ],
  // Social media: vê ativos e revela segredos das redes sociais —
  // tokens/API keys são bloqueados por tipo na action de revelação
  SOCIAL_MEDIA: [
    "clients.view",
    "tasks.view",
    "tasks.create",
    "tasks.update",
    "tasks.complete",
    "digital_assets.view",
    "digital_assets.view_secrets_metadata",
    "digital_assets.reveal_secrets",
    "digital_assets.upload_attachments",
    "digital_assets.download_attachments",
    "goals.view",
  ],
  // Designer: só links e anexos liberados — sem metadados de segredos
  DESIGNER: [
    "tasks.view",
    "tasks.update",
    "tasks.complete",
    "digital_assets.view",
    "digital_assets.download_attachments",
  ],
  // Comercial: ativos básicos sem segredos
  COMERCIAL: [
    "clients.view",
    "clients.create",
    "clients.update",
    "clients.moveStatus",
    "tasks.view",
    "tasks.create",
    "digital_assets.view",
    "goals.view",
  ],
  // Sem acesso ao Banco de Ativos Digitais (portal futuro)
  CLIENTE_CONVIDADO: [],
};

export function roleHasPermission(rolesOfUser: RoleName[], permission: PermissionKey): boolean {
  return rolesOfUser.some((role) => ROLE_PERMISSIONS[role]?.includes(permission));
}

// Rótulos amigáveis dos papéis para a gestão de acessos
export const ROLE_LABELS: Record<RoleName, string> = {
  OWNER: "Dono (acesso total)",
  ADMIN: "Administrador",
  GESTOR_OPERACIONAL: "Gestor operacional",
  GESTOR_TRAFEGO: "Gestor de tráfego",
  SOCIAL_MEDIA: "Social media",
  DESIGNER: "Designer",
  COMERCIAL: "Comercial",
  CLIENTE_CONVIDADO: "Cliente convidado",
};

// Papéis que só OWNER/ADMIN podem conceder (níveis administrativos sensíveis)
export const PRIVILEGED_ROLES: RoleName[] = ["OWNER", "ADMIN"];

// Presets de nível para agilizar a aprovação de novos acessos
export const ACCESS_LEVEL_PRESETS: { key: string; label: string; description: string; roles: RoleName[] }[] = [
  {
    key: "ADMINISTRATIVO",
    label: "Administrativo",
    description: "Acesso administrativo — gerencia quase tudo, incluindo acessos.",
    roles: ["ADMIN"],
  },
  {
    key: "USUARIO",
    label: "Usuário padrão",
    description: "Acesso operacional — clientes, tarefas, criativos e ativos atribuídos.",
    roles: ["GESTOR_TRAFEGO"],
  },
];

// Tipos de segredo que SOCIAL_MEDIA não pode revelar (tokens e chaves de API)
export const RESTRICTED_SECRET_TYPES_FOR_SOCIAL = ["TOKEN", "API_KEY", "TWO_FACTOR_SECRET"] as const;
