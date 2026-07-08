import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums (SQLite não tem enum nativo — garantidos via Drizzle text({enum}) + Zod)
// ---------------------------------------------------------------------------

export const AGENCY_BRANDS = ["B2C_GESTAO", "LIFE_ADS"] as const;
export const BUSINESS_MODELS = ["ECOMMERCE", "NEGOCIO_LOCAL", "OUTROS"] as const;
export const CLIENT_STATUSES = [
  "LEAD",
  "ONBOARDING",
  "IMPLANTACAO",
  "ATIVO",
  "EM_RISCO",
  "PAUSADO",
  "PERDIDO",
] as const;
export const HEALTH_STATUSES = ["ESTAVEL", "OBSERVACAO", "CRITICO"] as const;
export const ADS_STATUSES = ["ATIVO", "PAUSADO", "SEM_CAMPANHA"] as const;
export const PIPELINE_STAGE_STATUSES = [
  "PENDENTE",
  "EM_ANDAMENTO",
  "CONCLUIDA",
  "NAO_APLICAVEL",
] as const;
// Etapas do Kanban operacional (ciclo de vida do cliente na operação)
export const PIPELINE_STAGES = [
  "NOVO_CLIENTE",
  "CRIACAO_DE_GRUPO",
  "INTEGRACAO_META",
  "INTEGRACAO_GOOGLE",
  "PESQUISA_DE_MERCADO",
  "DIAGNOSTICO_ESTRATEGICO",
  "ESTUDO_DE_FUNIL",
  "INTEGRACAO_SOCIAL_MEDIA",
  "CRM",
  "BASE_DE_CLIENTES",
  "EM_OBSERVACAO",
  "CLIENTE_CRITICO",
  "PAUSADO",
  "CLIENTE_PERDIDO",
] as const;

export const TASK_TYPES = [
  "OPERACIONAL",
  "DIARIA",
  "SEMANAL",
  "SOCIAL_MEDIA",
  "CRIATIVO",
  "PROJETO",
  "CLIENTE_OCULTO",
  "CRM",
] as const;
export const TASK_STATUSES = [
  "BACKLOG",
  "A_FAZER",
  "EM_ANDAMENTO",
  "AGUARDANDO_CLIENTE",
  "AGUARDANDO_EQUIPE",
  "EM_REVISAO",
  "BLOQUEADA",
  "CONCLUIDA",
  "CANCELADA",
] as const;
export const TASK_PRIORITIES = ["BAIXA", "MEDIA", "ALTA", "URGENTE"] as const;

// Aprovação de tarefas do tipo CRIATIVO (briefing fica em tasks.creative)
export const CREATIVE_APPROVALS = [
  "PENDENTE",
  "AGUARDANDO_APROVACAO",
  "APROVADO",
  "REPROVADO",
] as const;
export type CreativeBrief = {
  objective?: string;
  platform?: string;
  format?: string;
  offer?: string;
  cta?: string;
  referenceLink?: string;
  approvalStatus?: (typeof CREATIVE_APPROVALS)[number];
};

export const CREATIVE_STATUSES = [
  "SOLICITADO",
  "EM_ROTEIRO",
  "EM_DESIGN",
  "EM_EDICAO",
  "AGUARDANDO_APROVACAO",
  "APROVADO",
  "REPROVADO",
  "PUBLICADO",
  "CANCELADO",
] as const;
export const CREATIVE_OBJECTIVES = [
  "MENSAGENS",
  "ENGAJAMENTO",
  "RECONHECIMENTO",
  "VENDAS",
  "LEADS",
  "SOCIAL_MEDIA",
] as const;
export const CREATIVE_PLATFORMS = [
  "META_ADS",
  "GOOGLE_ADS",
  "INSTAGRAM",
  "TIKTOK",
  "OUTRO",
] as const;
export const CREATIVE_TYPES = [
  "VIDEO",
  "IMAGEM",
  "CARROSSEL",
  "STORIES",
  "REELS",
  "COPY",
  "LANDING_PAGE",
] as const;

// ------------------------- Banco de Ativos Digitais -------------------------

export const ASSET_GROUP_TYPES = ["CLIENTE", "INTERNO", "PLATAFORMA", "OPERACAO", "OUTRO"] as const;
export const ASSET_GROUP_STATUSES = ["ATIVO", "PAUSADO", "ARQUIVADO"] as const;

export const ASSET_TYPES = [
  "FACEBOOK_ACCOUNT",
  "INSTAGRAM_ACCOUNT",
  "TIKTOK_ACCOUNT",
  "GOOGLE_ACCOUNT",
  "GOOGLE_ADS",
  "META_BUSINESS_MANAGER",
  "META_AD_ACCOUNT",
  "FACEBOOK_PAGE",
  "WHATSAPP_BUSINESS",
  "EMAIL_ACCOUNT",
  "WORDPRESS",
  "LANDING_PAGE",
  "DOMAIN",
  "HOSTING",
  "CRM",
  "ANTIDETECT_PROFILE",
  "BROWSER_PROFILE_BACKUP",
  "TOKEN",
  "API_KEY",
  "OTHER",
] as const;

export const ASSET_PLATFORMS = [
  "META",
  "FACEBOOK",
  "INSTAGRAM",
  "GOOGLE",
  "TIKTOK",
  "WORDPRESS",
  "HOSTINGER",
  "GODADDY",
  "REGISTRO_BR",
  "CLOUDFLARE",
  "WHATSAPP",
  "RD_STATION",
  "GOHIGHLEVEL",
  "CHATZAP",
  "ZAPTOS",
  "DOLPHIN_ANTY",
  "OUTRA",
] as const;

// No Trello existiam duas etiquetas BLOQUEADA — aqui é um status único.
export const ASSET_STATUSES = [
  "ATIVA",
  "PRONTA_PARA_USO",
  "ANALISE_SOLICITADA",
  "BLOQUEADA",
  "PRECISA_DE_DOCUMENTOS",
  "NAO_INFORMADO",
  "SENDO_ESQUENTADA",
  "EM_REVISAO",
  "PAUSADA",
  "ARQUIVADA",
] as const;

export const ASSET_PRIORITIES = ["BAIXA", "MEDIA", "ALTA", "CRITICA"] as const;

export const SECRET_TYPES = [
  "USERNAME",
  "PASSWORD",
  "EMAIL",
  "EMAIL_PASSWORD",
  "RECOVERY_EMAIL",
  "TOKEN",
  "API_KEY",
  "BACKUP_CODE",
  "TWO_FACTOR_SECRET",
  "OTHER",
] as const;

export const ASSET_COMMENT_TYPES = [
  "COMENTARIO",
  "FEEDBACK",
  "ANALISE",
  "ALERTA",
  "ALTERACAO_STATUS",
  "OUTRO",
] as const;

export const ASSET_AUDIT_ACTIONS = [
  "ASSET_CREATED",
  "ASSET_UPDATED",
  "ASSET_ARCHIVED",
  "SECRET_CREATED",
  "SECRET_UPDATED",
  "SECRET_DELETED",
  "SECRET_REVEALED",
  "SECRET_COPIED",
  "ATTACHMENT_UPLOADED",
  "ATTACHMENT_DOWNLOADED",
  "ATTACHMENT_DELETED",
  "STATUS_CHANGED",
  "PERMISSION_DENIED",
] as const;
export const TEAM_MEMBER_STATUSES = ["ATIVO", "INATIVO"] as const;
// Situação da conta de acesso ao sistema
export const USER_STATUSES = ["PENDENTE", "ATIVO", "INATIVO", "REJEITADO"] as const;
export const GOAL_SCOPES = ["AGENCIA", "GESTOR", "CLIENTE"] as const;
export const GOAL_STATUSES = [
  "PLANEJADA",
  "EM_EXECUCAO",
  "EM_RISCO",
  "FINALIZANDO",
  "FINALIZADA",
  "CONCLUIDA",
  "CANCELADA",
] as const;
export const GOAL_CATEGORIES = [
  "CLIENTES",
  "CHURN",
  "SATISFACAO",
  "COMERCIAL",
  "OPERACIONAL",
] as const;
export const DOCUMENT_TYPES = [
  "WIKI",
  "PROCESSO",
  "CONTRATO",
  "BRIEFING",
  "RELATORIO",
  "PLAYBOOK",
  "PDF",
  "DOCX",
  "GOOGLE_DOC",
  "GOOGLE_SHEET",
  "GOOGLE_SLIDES",
  "DRIVE_FOLDER",
  "LINK_EXTERNO",
  "IMAGEM",
  "OUTRO",
] as const;
// Origem do documento: markdown interno, upload de arquivo, Google Drive, link externo
export const DOCUMENT_SOURCES = ["INTERNAL", "UPLOAD", "GOOGLE_DRIVE", "EXTERNAL_LINK"] as const;
export const TEMPLATE_ROLES = [
  "GESTOR",
  "ESTRATEGISTA",
  "SOCIAL_MEDIA",
  "DESIGNER",
] as const;
export const NOTIFICATION_TYPES = ["INFO", "ALERTA", "COBRANCA", "TAREFA", "SISTEMA"] as const;
export const AUTOMATION_TRIGGERS = [
  "CLIENT_CREATED",
  "CLIENT_STAGE_CHANGED",
  "CLIENT_HEALTH_CHANGED",
  "CLIENT_MARKED_LOST",
  "TASK_CREATED",
  "TASK_DUE_SOON",
  "TASK_OVERDUE",
  "TASK_STATUS_CHANGED",
  "ASSET_CREATED",
  "ASSET_STATUS_CHANGED",
  "FORM_SUBMITTED",
] as const;
export const AUTOMATION_ACTIONS = [
  "CREATE_TASK",
  "APPLY_TEMPLATE",
  "SEND_NOTIFICATION",
  "UPDATE_CLIENT_FIELD",
  "UPDATE_TASK_FIELD",
  "ADD_COMMENT",
  "CREATE_ACTIVITY_LOG",
  "CHANGE_CLIENT_HEALTH",
  "MARK_CLIENT_AS_RISK",
] as const;
export const AUTOMATION_SCOPES = ["GLOBAL", "OPERACIONAL"] as const;
export const AUTOMATION_EXEC_STATUSES = ["SUCESSO", "ERRO", "IGNORADA"] as const;
export const ROLE_NAMES = [
  "OWNER",
  "ADMIN",
  "GESTOR_OPERACIONAL",
  "GESTOR_TRAFEGO",
  "SOCIAL_MEDIA",
  "DESIGNER",
  "COMERCIAL",
  "CLIENTE_CONVIDADO",
] as const;

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () =>
  timestamp("created_at", { mode: "date" })
    .notNull()
    .$defaultFn(() => new Date());
const updatedAt = () =>
  timestamp("updated_at", { mode: "date" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date());

// ---------------------------------------------------------------------------
// Usuários, papéis e permissões
// ---------------------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    id: id(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    // status ATIVO libera login; PENDENTE aguarda aprovação de um administrador.
    // isActive é mantido em sincronia (ATIVO => true) para as listas de atribuição.
    status: text("status", { enum: USER_STATUSES }).notNull().default("ATIVO"),
    isActive: boolean("is_active").notNull().default(true),
    // como a conta foi criada: SELF_SIGNUP (auto-cadastro) ou ADMIN
    signupSource: text("signup_source", { enum: ["SELF_SIGNUP", "ADMIN"] })
      .notNull()
      .default("ADMIN"),
    approvedById: text("approved_by_id"),
    approvedAt: timestamp("approved_at", { mode: "date" }),
    avatarUrl: text("avatar_url"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email), index("users_status_idx").on(t.status)],
);

export const roles = pgTable("roles", {
  id: id(),
  name: text("name", { enum: ROLE_NAMES }).notNull().unique(),
  description: text("description"),
  createdAt: createdAt(),
});

export const permissions = pgTable("permissions", {
  id: id(),
  // formato "modulo.acao", ex.: "clients.view", "vault.revealSecret"
  key: text("key").notNull().unique(),
  description: text("description"),
});

export const userRoles = pgTable(
  "user_roles",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] })],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: text("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);

export const teamMembers = pgTable("team_members", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  phone: text("phone"),
  position: text("position"), // cargo (ex.: Gestor de Tráfego Sênior)
  status: text("status", { enum: TEAM_MEMBER_STATUSES }).notNull().default("ATIVO"),
  hiredAt: timestamp("hired_at", { mode: "date" }),
  notes: text("notes"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

export const clients = pgTable(
  "clients",
  {
    id: id(),
    name: text("name").notNull(),
    legalName: text("legal_name"),
    brandName: text("brand_name"),
    agencyBrand: text("agency_brand", { enum: AGENCY_BRANDS })
      .notNull()
      .default("B2C_GESTAO"),
    businessModel: text("business_model", { enum: BUSINESS_MODELS })
      .notNull()
      .default("OUTROS"),
    niche: text("niche"),
    city: text("city"),
    state: text("state"),
    instagramUrl: text("instagram_url"),
    websiteUrl: text("website_url"),
    decisionMakerName: text("decision_maker_name"),
    decisionMakerPhone: text("decision_maker_phone"),
    decisionMakerEmail: text("decision_maker_email"),
    status: text("status", { enum: CLIENT_STATUSES }).notNull().default("LEAD"),
    healthStatus: text("health_status", { enum: HEALTH_STATUSES })
      .notNull()
      .default("ESTAVEL"),
    adsStatus: text("ads_status", { enum: ADS_STATUSES })
      .notNull()
      .default("SEM_CAMPANHA"),
    pipelineStage: text("pipeline_stage", { enum: PIPELINE_STAGES })
      .notNull()
      .default("NOVO_CLIENTE"),
    strategistId: text("strategist_id").references(() => users.id),
    trafficManager1Id: text("traffic_manager_1_id").references(() => users.id),
    trafficManager2Id: text("traffic_manager_2_id").references(() => users.id),
    mainResponsibleId: text("main_responsible_id").references(() => users.id),
    startDate: timestamp("start_date", { mode: "date" }),
    churnDate: timestamp("churn_date", { mode: "date" }),
    churnReason: text("churn_reason"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("clients_status_idx").on(t.status),
    index("clients_health_idx").on(t.healthStatus),
    index("clients_brand_idx").on(t.agencyBrand),
    index("clients_niche_idx").on(t.niche),
    index("clients_strategist_idx").on(t.strategistId),
    index("clients_tm1_idx").on(t.trafficManager1Id),
    index("clients_tm2_idx").on(t.trafficManager2Id),
    index("clients_responsible_idx").on(t.mainResponsibleId),
    index("clients_pipeline_idx").on(t.pipelineStage),
  ],
);

export const clientContacts = pgTable(
  "client_contacts",
  {
    id: id(),
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    role: text("role"),
    phone: text("phone"),
    email: text("email"),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("client_contacts_client_idx").on(t.clientId)],
);

export const clientOperationalProfiles = pgTable("client_operational_profiles", {
  id: id(),
  clientId: text("client_id")
    .notNull()
    .unique()
    .references(() => clients.id, { onDelete: "cascade" }),
  // ["META_ADS","GOOGLE_ADS","SOCIAL_MEDIA","CRM","IA","SEO","GMB"]
  platforms: jsonb("platforms").$type<string[]>().notNull().default([]),
  averageDailyBudget: real("average_daily_budget"),
  campaignObjective: text("campaign_objective"),
  campaignTypes: jsonb("campaign_types").$type<string[]>().notNull().default([]),
  offerDescription: text("offer_description"),
  funnelNotes: text("funnel_notes"),
  serviceRules: text("service_rules"),
  monthlyMeetingRequired: boolean("monthly_meeting_required")
    .notNull()
    .default(false),
  briefingText: text("briefing_text"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const clientHealthLogs = pgTable(
  "client_health_logs",
  {
    id: id(),
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    previousStatus: text("previous_status", { enum: HEALTH_STATUSES }),
    newStatus: text("new_status", { enum: HEALTH_STATUSES }).notNull(),
    reason: text("reason"),
    changedById: text("changed_by_id").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("client_health_logs_client_idx").on(t.clientId)],
);

// Etapas de implantação (ex-status do ClickUp: criação de grupo, integração
// Meta/Google, pesquisa de mercado, diagnóstico, estudo de funil...)
export const clientPipelineStages = pgTable(
  "client_pipeline_stages",
  {
    id: id(),
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    order: integer("order").notNull().default(0),
    status: text("status", { enum: PIPELINE_STAGE_STATUSES })
      .notNull()
      .default("PENDENTE"),
    completedAt: timestamp("completed_at", { mode: "date" }),
    completedById: text("completed_by_id").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("client_pipeline_stages_client_idx").on(t.clientId)],
);

// ---------------------------------------------------------------------------
// Projetos e tarefas
// ---------------------------------------------------------------------------

export const projects = pgTable(
  "projects",
  {
    id: id(),
    name: text("name").notNull(),
    description: text("description"),
    clientId: text("client_id").references(() => clients.id, { onDelete: "set null" }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("projects_client_idx").on(t.clientId)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    title: text("title").notNull(),
    description: text("description"),
    type: text("type", { enum: TASK_TYPES }).notNull().default("OPERACIONAL"),
    status: text("status", { enum: TASK_STATUSES }).notNull().default("A_FAZER"),
    priority: text("priority", { enum: TASK_PRIORITIES }).notNull().default("MEDIA"),
    clientId: text("client_id").references(() => clients.id, { onDelete: "set null" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    parentTaskId: text("parent_task_id"),
    // tarefa pode ser vinculada a um ativo digital (ex.: "resolver conta bloqueada")
    digitalAssetId: text("digital_asset_id"),
    assignedToId: text("assigned_to_id").references(() => users.id),
    createdById: text("created_by_id").references(() => users.id),
    cancelReason: text("cancel_reason"),
    dueDate: timestamp("due_date", { mode: "date" }),
    startDate: timestamp("start_date", { mode: "date" }),
    completedAt: timestamp("completed_at", { mode: "date" }),
    estimatedMinutes: integer("estimated_minutes"),
    trackedMinutes: integer("tracked_minutes").notNull().default(0),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    // Briefing de criativo — usado quando type = CRIATIVO (Criativos não é mais módulo próprio)
    creative: jsonb("creative").$type<CreativeBrief>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("tasks_status_idx").on(t.status),
    index("tasks_type_idx").on(t.type),
    index("tasks_client_idx").on(t.clientId),
    index("tasks_assigned_idx").on(t.assignedToId),
    index("tasks_due_idx").on(t.dueDate),
    index("tasks_parent_idx").on(t.parentTaskId),
    index("tasks_asset_idx").on(t.digitalAssetId),
  ],
);

// Responsáveis adicionais ("outros responsáveis")
export const taskAssignees = pgTable(
  "task_assignees",
  {
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.userId] })],
);

export const taskComments = pgTable(
  "task_comments",
  {
    id: id(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => users.id),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("task_comments_task_idx").on(t.taskId)],
);

export const taskChecklists = pgTable(
  "task_checklists",
  {
    id: id(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    order: integer("order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("task_checklists_task_idx").on(t.taskId)],
);

export const taskChecklistItems = pgTable(
  "task_checklist_items",
  {
    id: id(),
    checklistId: text("checklist_id")
      .notNull()
      .references(() => taskChecklists.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    isDone: boolean("is_done").notNull().default(false),
    order: integer("order").notNull().default(0),
    completedById: text("completed_by_id").references(() => users.id),
    completedAt: timestamp("completed_at", { mode: "date" }),
  },
  (t) => [index("task_checklist_items_checklist_idx").on(t.checklistId)],
);

export const taskAttachments = pgTable(
  "task_attachments",
  {
    id: id(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    fileUrl: text("file_url").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    uploadedById: text("uploaded_by_id").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("task_attachments_task_idx").on(t.taskId)],
);

export const taskDependencies = pgTable(
  "task_dependencies",
  {
    // taskId depende de dependsOnTaskId
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    dependsOnTaskId: text("depends_on_task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.dependsOnTaskId] })],
);

export const taskTimeEntries = pgTable(
  "task_time_entries",
  {
    id: id(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id),
    minutes: integer("minutes").notNull(),
    description: text("description"),
    date: timestamp("date", { mode: "date" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("task_time_entries_task_idx").on(t.taskId)],
);

// ---------------------------------------------------------------------------
// Criativos — DEPRECATED: o módulo foi absorvido por Tarefas (tipo CRIATIVO).
// A tabela permanece apenas para preservar dados históricos em produção;
// nenhuma tela ou action escreve/lê daqui. Remover em uma limpeza futura.
// ---------------------------------------------------------------------------

export const creativeRequests = pgTable(
  "creative_requests",
  {
    id: id(),
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    briefing: text("briefing"),
    objective: text("objective", { enum: CREATIVE_OBJECTIVES }),
    platform: text("platform", { enum: CREATIVE_PLATFORMS }),
    creativeType: text("creative_type", { enum: CREATIVE_TYPES }),
    status: text("status", { enum: CREATIVE_STATUSES }).notNull().default("SOLICITADO"),
    requestedById: text("requested_by_id").references(() => users.id),
    copyResponsibleId: text("copy_responsible_id").references(() => users.id),
    assignedToId: text("assigned_to_id").references(() => users.id), // design/edição
    dueDate: timestamp("due_date", { mode: "date" }),
    deliveredAt: timestamp("delivered_at", { mode: "date" }),
    approvedAt: timestamp("approved_at", { mode: "date" }),
    fileLinks: text("file_links"),
    publishedLink: text("published_link"),
    offer: text("offer"),
    cta: text("cta"),
    observations: text("observations"),
    clientFeedback: text("client_feedback"),
    rejectionReason: text("rejection_reason"),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("creative_requests_client_idx").on(t.clientId),
    index("creative_requests_status_idx").on(t.status),
    index("creative_requests_assigned_idx").on(t.assignedToId),
  ],
);

// ---------------------------------------------------------------------------
// Banco de Ativos Digitais
// Contas, perfis, BMs, contas de anúncio, e-mails, domínios, tokens e backups.
// Segredos ficam SEMPRE criptografados em digital_asset_secrets (AES-256-GCM).
// ---------------------------------------------------------------------------

// Agrupador (equivalente a uma lista do Trello): um cliente, área interna ou plataforma
export const digitalAssetGroups = pgTable(
  "digital_asset_groups",
  {
    id: id(),
    name: text("name").notNull(),
    description: text("description"),
    type: text("type", { enum: ASSET_GROUP_TYPES }).notNull().default("CLIENTE"),
    clientId: text("client_id").references(() => clients.id, { onDelete: "set null" }),
    status: text("status", { enum: ASSET_GROUP_STATUSES }).notNull().default("ATIVO"),
    order: integer("order").notNull().default(0),
    createdById: text("created_by_id").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("asset_groups_client_idx").on(t.clientId),
    index("asset_groups_status_idx").on(t.status),
  ],
);

// Um ativo digital (equivalente a um cartão do Trello)
export const digitalAssets = pgTable(
  "digital_assets",
  {
    id: id(),
    groupId: text("group_id")
      .notNull()
      .references(() => digitalAssetGroups.id, { onDelete: "cascade" }),
    clientId: text("client_id").references(() => clients.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    assetType: text("asset_type", { enum: ASSET_TYPES }).notNull().default("OTHER"),
    platform: text("platform", { enum: ASSET_PLATFORMS }).notNull().default("OUTRA"),
    status: text("status", { enum: ASSET_STATUSES }).notNull().default("NAO_INFORMADO"),
    priority: text("priority", { enum: ASSET_PRIORITIES }).notNull().default("MEDIA"),
    ownerUserId: text("owner_user_id").references(() => users.id),
    assignedToId: text("assigned_to_id").references(() => users.id),
    loginUrl: text("login_url"),
    profileUrl: text("profile_url"),
    businessManagerId: text("business_manager_id"),
    adAccountId: text("ad_account_id"),
    pageId: text("page_id"),
    profileId: text("profile_id"),
    externalId: text("external_id"),
    recoveryEmail: text("recovery_email"),
    notes: text("notes"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    lastCheckedAt: timestamp("last_checked_at", { mode: "date" }),
    nextReviewAt: timestamp("next_review_at", { mode: "date" }),
    createdById: text("created_by_id").references(() => users.id),
    updatedById: text("updated_by_id").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp("archived_at", { mode: "date" }),
  },
  (t) => [
    index("assets_group_idx").on(t.groupId),
    index("assets_client_idx").on(t.clientId),
    index("assets_type_idx").on(t.assetType),
    index("assets_platform_idx").on(t.platform),
    index("assets_status_idx").on(t.status),
    index("assets_assigned_idx").on(t.assignedToId),
    index("assets_review_idx").on(t.nextReviewAt),
  ],
);

// Segredos criptografados (senhas, tokens, e-mails de recuperação...)
export const digitalAssetSecrets = pgTable(
  "digital_asset_secrets",
  {
    id: id(),
    assetId: text("asset_id")
      .notNull()
      .references(() => digitalAssets.id, { onDelete: "cascade" }),
    secretType: text("secret_type", { enum: SECRET_TYPES }).notNull().default("PASSWORD"),
    label: text("label").notNull(),
    // AES-256-GCM: iv:authTag:ciphertext (base64) — NUNCA texto puro
    encryptedValue: text("encrypted_value").notNull(),
    // prévia mascarada para listagem — nunca contém o valor completo
    maskedPreview: text("masked_preview").notNull(),
    createdById: text("created_by_id").references(() => users.id),
    updatedById: text("updated_by_id").references(() => users.id),
    lastRevealedAt: timestamp("last_revealed_at", { mode: "date" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("asset_secrets_asset_idx").on(t.assetId)],
);

export const digitalAssetAttachments = pgTable(
  "digital_asset_attachments",
  {
    id: id(),
    assetId: text("asset_id")
      .notNull()
      .references(() => digitalAssets.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    fileType: text("file_type"),
    fileSize: integer("file_size"),
    storagePath: text("storage_path").notNull(),
    uploadedById: text("uploaded_by_id").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("asset_attachments_asset_idx").on(t.assetId)],
);

// Comentários/diário operacional do ativo (substitui os comentários do Trello)
export const digitalAssetComments = pgTable(
  "digital_asset_comments",
  {
    id: id(),
    assetId: text("asset_id")
      .notNull()
      .references(() => digitalAssets.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => users.id),
    content: text("content").notNull(),
    type: text("type", { enum: ASSET_COMMENT_TYPES }).notNull().default("COMENTARIO"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("asset_comments_asset_idx").on(t.assetId)],
);

export const digitalAssetStatusHistory = pgTable(
  "digital_asset_status_history",
  {
    id: id(),
    assetId: text("asset_id")
      .notNull()
      .references(() => digitalAssets.id, { onDelete: "cascade" }),
    oldStatus: text("old_status", { enum: ASSET_STATUSES }),
    newStatus: text("new_status", { enum: ASSET_STATUSES }).notNull(),
    reason: text("reason"),
    changedById: text("changed_by_id").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("asset_status_history_asset_idx").on(t.assetId)],
);

// Auditoria de ações sensíveis — NUNCA armazenar o valor do segredo aqui
export const digitalAssetAuditLogs = pgTable(
  "digital_asset_audit_logs",
  {
    id: id(),
    assetId: text("asset_id").references(() => digitalAssets.id, { onDelete: "set null" }),
    userId: text("user_id").references(() => users.id),
    action: text("action", { enum: ASSET_AUDIT_ACTIONS }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [
    index("asset_audit_asset_idx").on(t.assetId),
    index("asset_audit_action_idx").on(t.action),
    index("asset_audit_created_idx").on(t.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Metas
// ---------------------------------------------------------------------------

export const goals = pgTable("goals", {
  id: id(),
  title: text("title").notNull(),
  description: text("description"),
  scope: text("scope", { enum: GOAL_SCOPES }).notNull().default("AGENCIA"),
  category: text("category", { enum: GOAL_CATEGORIES }).notNull().default("OPERACIONAL"),
  ownerId: text("owner_id").references(() => users.id),
  clientId: text("client_id").references(() => clients.id, { onDelete: "set null" }),
  status: text("status", { enum: GOAL_STATUSES }).notNull().default("PLANEJADA"),
  targetValue: real("target_value").notNull().default(0), // meta
  superTargetValue: real("super_target_value"), // super meta
  megaTargetValue: real("mega_target_value"), // mega meta
  currentValue: real("current_value").notNull().default(0),
  unit: text("unit"), // ex.: "R$", "clientes", "%"
  autoProgress: boolean("auto_progress").notNull().default(false),
  periodStart: timestamp("period_start", { mode: "date" }),
  periodEnd: timestamp("period_end", { mode: "date" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const goalTargets = pgTable(
  "goal_targets",
  {
    id: id(),
    goalId: text("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    metric: text("metric").notNull(), // ex.: "clientes_ativos", "mrr", "churn_pct"
    unit: text("unit"), // ex.: "clientes", "R$", "%"
    targetValue: real("target_value").notNull(),
    currentValue: real("current_value").notNull().default(0),
  },
  (t) => [index("goal_targets_goal_idx").on(t.goalId)],
);

// ---------------------------------------------------------------------------
// Documentos (NUNCA credenciais — credenciais vão para o cofre)
// ---------------------------------------------------------------------------

export const documents = pgTable(
  "documents",
  {
    id: id(),
    title: text("title").notNull(),
    description: text("description"),
    content: text("content"), // markdown (origem INTERNAL)
    type: text("type", { enum: DOCUMENT_TYPES }).notNull().default("WIKI"),
    sourceType: text("source_type", { enum: DOCUMENT_SOURCES }).notNull().default("INTERNAL"),
    // Arquivo enviado (UPLOAD) ou link externo (EXTERNAL_LINK)
    fileUrl: text("file_url"),
    storagePath: text("storage_path"), // caminho interno do arquivo enviado
    mimeType: text("mime_type"),
    // Google Drive (GOOGLE_DRIVE) — apenas metadados/link, nunca o conteúdo
    googleDriveFileId: text("google_drive_file_id"),
    googleDriveUrl: text("google_drive_url"),
    category: text("category"), // ex.: estrategia, funil, processo, wiki
    clientId: text("client_id").references(() => clients.id, { onDelete: "set null" }),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
    // vínculo opcional a um ativo digital (sem FK no banco, igual a tasks.digitalAssetId)
    digitalAssetId: text("digital_asset_id"),
    isArchived: boolean("is_archived").notNull().default(false),
    visibleToRoles: jsonb("visible_to_roles")
      .$type<string[]>()
      .notNull()
      .default([]),
    createdById: text("created_by_id").references(() => users.id),
    updatedById: text("updated_by_id").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("documents_client_idx").on(t.clientId),
    index("documents_type_idx").on(t.type),
  ],
);

// ---------------------------------------------------------------------------
// Auditoria e notificações
// ---------------------------------------------------------------------------

export const activityLogs = pgTable(
  "activity_logs",
  {
    id: id(),
    userId: text("user_id").references(() => users.id),
    action: text("action").notNull(), // ex.: "client.statusChanged", "vault.secretRevealed"
    entityType: text("entity_type").notNull(), // ex.: "client", "task", "vaultItem"
    entityId: text("entity_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [
    index("activity_logs_entity_idx").on(t.entityType, t.entityId),
    index("activity_logs_user_idx").on(t.userId),
    index("activity_logs_created_idx").on(t.createdAt),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type", { enum: NOTIFICATION_TYPES }).notNull().default("INFO"),
    title: text("title").notNull(),
    body: text("body"),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    readAt: timestamp("read_at", { mode: "date" }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt)],
);

// ---------------------------------------------------------------------------
// Automações
// ---------------------------------------------------------------------------

export const automationRules = pgTable("automation_rules", {
  id: id(),
  name: text("name").notNull(),
  description: text("description"),
  triggerType: text("trigger_type", { enum: AUTOMATION_TRIGGERS }).notNull(),
  conditions: jsonb("conditions").$type<Record<string, unknown>>(),
  actions: jsonb("actions").$type<
    { type: (typeof AUTOMATION_ACTIONS)[number]; params?: Record<string, unknown> }[]
  >(),
  enabled: boolean("enabled").notNull().default(true),
  scope: text("scope", { enum: AUTOMATION_SCOPES }).notNull().default("GLOBAL"),
  createdById: text("created_by_id").references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const automationExecutionLogs = pgTable(
  "automation_execution_logs",
  {
    id: id(),
    ruleId: text("rule_id")
      .notNull()
      .references(() => automationRules.id, { onDelete: "cascade" }),
    status: text("status", { enum: AUTOMATION_EXEC_STATUSES }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    error: text("error"),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    executedAt: timestamp("executed_at", { mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("automation_exec_rule_idx").on(t.ruleId)],
);

// ---------------------------------------------------------------------------
// Formulários
// ---------------------------------------------------------------------------

export const formTemplates = pgTable("form_templates", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(), // ex.: "onboarding", "briefing"
  description: text("description"),
  // definição dos campos: [{name, label, type, required, options?}]
  fields: jsonb("fields").$type<Record<string, unknown>[]>().notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdById: text("created_by_id").references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const formSubmissions = pgTable(
  "form_submissions",
  {
    id: id(),
    templateId: text("template_id")
      .notNull()
      .references(() => formTemplates.id, { onDelete: "cascade" }),
    clientId: text("client_id").references(() => clients.id, { onDelete: "set null" }),
    submittedById: text("submitted_by_id").references(() => users.id),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("form_submissions_template_idx").on(t.templateId),
    index("form_submissions_client_idx").on(t.clientId),
  ],
);

// ---------------------------------------------------------------------------
// Templates operacionais (checklists/tarefas padrão aplicáveis a clientes)
// ---------------------------------------------------------------------------

export type TemplateItem = {
  title: string;
  dueOffsetDays?: number; // D+N a partir da aplicação
  role?: (typeof TEMPLATE_ROLES)[number]; // responsável padrão por função
};

export const taskTemplates = pgTable("task_templates", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  taskType: text("task_type", { enum: TASK_TYPES }).notNull().default("OPERACIONAL"),
  // etapa do pipeline que dispara este template via automação (opcional)
  pipelineStage: text("pipeline_stage", { enum: PIPELINE_STAGES }),
  items: jsonb("items").$type<TemplateItem[]>().notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdById: text("created_by_id").references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------------------
// Reuniões com cliente
// ---------------------------------------------------------------------------

export const MEETING_TYPES = [
  "ONBOARDING",
  "ACOMPANHAMENTO",
  "ALINHAMENTO",
  "APRESENTACAO",
  "RENOVACAO",
  "OUTRO",
] as const;
export const MEETING_STATUSES = ["AGENDADA", "REALIZADA", "CANCELADA", "REMARCADA"] as const;

export const clientMeetings = pgTable(
  "client_meetings",
  {
    id: id(),
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    // meetingDate guarda data + hora
    meetingDate: timestamp("meeting_date", { mode: "date" }).notNull(),
    meetingType: text("meeting_type", { enum: MEETING_TYPES }).notNull().default("ACOMPANHAMENTO"),
    status: text("status", { enum: MEETING_STATUSES }).notNull().default("AGENDADA"),
    participants: text("participants"), // lista livre de participantes
    responsibleId: text("responsible_id").references(() => users.id),
    meetLink: text("meet_link"), // URL do Google Meet ou outro
    summary: text("summary"), // notas
    nextSteps: text("next_steps"), // próximos passos (viram tarefas de follow-up)
    createdById: text("created_by_id").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("client_meetings_client_idx").on(t.clientId)],
);

// ---------------------------------------------------------------------------
// Importação (ClickUp → COP)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Configurações do sistema
// ---------------------------------------------------------------------------

// Serviços prestados pela agência — cadastro configurável pelo Admin.
// Usado na ficha do cliente como "serviços utilizados" (substitui o antigo
// enum fixo de plataformas).
export const agencyServices = pgTable("agency_services", {
  id: id(),
  name: text("name").notNull().unique(),
  description: text("description"),
  category: text("category"), // ex.: Tráfego, Social, Criação, Tecnologia
  color: text("color"), // nome de tom (emerald, amber, ...)
  isActive: boolean("is_active").notNull().default(true),
  order: integer("order").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// Chave-valor de configurações e feature flags (ex.: copiloto, google_drive,
// google_meet, opções de filtros do dashboard). Só OWNER/ADMIN alteram.
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedById: text("updated_by_id").references(() => users.id),
  updatedAt: updatedAt(),
});

// Taxonomias configuráveis pelo Admin (status, opções de filtro, cores, ordem).
// Grupos do sistema (isSystem) têm valores travados na lógica — só rótulo/cor/
// ordem/ativo são editáveis. Grupos livres (nicho, tags) aceitam novos valores.
export const configOptionGroups = pgTable(
  "config_option_groups",
  {
    id: id(),
    moduleKey: text("module_key").notNull(), // clients, tasks, operation, digital_assets, goals
    groupKey: text("group_key").notNull(), // status, health, niche, ...
    name: text("name").notNull(),
    description: text("description"),
    isSystem: boolean("is_system").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("config_group_module_key_idx").on(t.moduleKey, t.groupKey)],
);

export const configOptions = pgTable(
  "config_options",
  {
    id: id(),
    groupId: text("group_id")
      .notNull()
      .references(() => configOptionGroups.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    value: text("value").notNull(),
    color: text("color"), // nome de tom (emerald, amber, red, blue, purple, zinc, cyan)
    order: integer("order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    isDefault: boolean("is_default").notNull().default(false),
    // isSystem: valor travado (enum de negócio) — não pode ser removido, só editado
    isSystem: boolean("is_system").notNull().default(false),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("config_options_group_idx").on(t.groupId)],
);

export const configOptionGroupsRelations = relations(configOptionGroups, ({ many }) => ({
  options: many(configOptions),
}));
export const configOptionsRelations = relations(configOptions, ({ one }) => ({
  group: one(configOptionGroups, {
    fields: [configOptions.groupId],
    references: [configOptionGroups.id],
  }),
}));


// ---------------------------------------------------------------------------
// Co-piloto do Gestor — sugestões com aprovação obrigatória + escuta WhatsApp
// (integração futura, por usuário, com consentimento — nunca automação oculta).
// Nenhuma ação é executada em nome do gestor sem aprovação explícita.
// ---------------------------------------------------------------------------

export const COPILOT_SUGGESTION_TYPES = [
  "ENTRAR_EM_CONTATO_COM_CLIENTE",
  "REVISAR_CLIENTE_CRITICO",
  "COBRAR_RESPOSTA_INTERNA",
  "PRIORIZAR_TAREFA",
  "CRIAR_TAREFA",
  "ALTERAR_STATUS_CLIENTE",
  "ALTERAR_SAUDE_CLIENTE",
  "GERAR_RESUMO",
  "PREPARAR_RELATORIO",
  "RESPONDER_DUVIDA",
  "QUEBRAR_OBJECAO",
  "ACOMPANHAR_GRUPO",
  "OUTRO",
] as const;
export const COPILOT_SUGGESTION_STATUSES = [
  "PENDENTE",
  "APROVADA",
  "REJEITADA",
  "EXECUTADA",
  "CANCELADA",
] as const;
// REGRAS = motor determinístico interno; IA = modelo de linguagem (fase futura)
export const COPILOT_SOURCES = ["REGRAS", "IA", "MANUAL"] as const;

export const copilotSuggestions = pgTable(
  "copilot_suggestions",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clientId: text("client_id").references(() => clients.id, { onDelete: "set null" }),
    taskId: text("task_id"),
    digitalAssetId: text("digital_asset_id"),
    type: text("type", { enum: COPILOT_SUGGESTION_TYPES }).notNull().default("OUTRO"),
    title: text("title").notNull(),
    description: text("description"),
    suggestedAction: text("suggested_action").notNull(),
    priority: text("priority", { enum: TASK_PRIORITIES }).notNull().default("MEDIA"),
    status: text("status", { enum: COPILOT_SUGGESTION_STATUSES }).notNull().default("PENDENTE"),
    source: text("source", { enum: COPILOT_SOURCES }).notNull().default("REGRAS"),
    // resumo objetivo da justificativa — nunca chain-of-thought
    aiReasoningSummary: text("ai_reasoning_summary"),
    // chave de idempotência (type:entidade) — evita sugerir a mesma coisa 2x
    dedupeKey: text("dedupe_key"),
    resolvedById: text("resolved_by_id").references(() => users.id),
    resolvedAt: timestamp("resolved_at", { mode: "date" }),
    executedTaskId: text("executed_task_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("copilot_suggestions_user_idx").on(t.userId, t.status),
    index("copilot_suggestions_dedupe_idx").on(t.dedupeKey),
  ],
);

// Ações estruturadas anexadas a sugestões — o que o sistema fará QUANDO (e só
// quando) o gestor aprovar. Execução valida permissão + payload e gera log.
export const COPILOT_ACTION_TYPES = [
  "CREATE_TASK",
  "UPDATE_TASK_STATUS",
  "UPDATE_TASK_PRIORITY",
  "UPDATE_CLIENT_HEALTH",
  "UPDATE_CLIENT_STATUS",
  "CREATE_CLIENT_COMMENT",
  "CREATE_TASK_COMMENT",
  "CREATE_REMINDER",
  "CREATE_MEETING",
  "GENERATE_REPORT",
  "PREPARE_WHATSAPP_MESSAGE",
  "SEND_WHATSAPP_MESSAGE_FUTURE",
  "LINK_CONVERSATION_TO_CLIENT",
] as const;
export const COPILOT_ACTION_STATUSES = [
  "PENDENTE",
  "APROVADA",
  "EXECUTADA",
  "FALHOU",
  "CANCELADA",
] as const;

export const copilotActions = pgTable(
  "copilot_actions",
  {
    id: id(),
    suggestionId: text("suggestion_id")
      .notNull()
      .references(() => copilotSuggestions.id, { onDelete: "cascade" }),
    actionType: text("action_type", { enum: COPILOT_ACTION_TYPES }).notNull(),
    targetType: text("target_type"), // client | task | digitalAsset | conversation | user
    targetId: text("target_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status", { enum: COPILOT_ACTION_STATUSES }).notNull().default("PENDENTE"),
    approvedById: text("approved_by_id").references(() => users.id),
    executedAt: timestamp("executed_at", { mode: "date" }),
    errorMessage: text("error_message"),
    resultSummary: text("result_summary"),
    resultRef: text("result_ref"), // caminho interno do resultado (ex.: /tarefas/<id>)
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("copilot_actions_suggestion_idx").on(t.suggestionId, t.status)],
);

export const WHATSAPP_STATUSES = [
  "NAO_CONECTADO",
  "CONECTANDO",
  "CONECTADO",
  "ERRO",
  "DESCONECTADO",
] as const;
export const CONVERSATION_TYPES = ["GRUPO", "CONTATO"] as const;
export const CONVERSATION_SENTIMENTS = ["POSITIVO", "NEUTRO", "NEGATIVO"] as const;

// Conexão WhatsApp por usuário — apenas via provedor oficial/autorizado (fase
// futura). Sem scraping, sem burlar termos de plataforma. Conexão é voluntária.
export const whatsappConnections = pgTable("whatsapp_connections", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default("NAO_DEFINIDO"), // ex.: cloud_api
  phoneNumber: text("phone_number"),
  status: text("status", { enum: WHATSAPP_STATUSES }).notNull().default("NAO_CONECTADO"),
  connectedAt: timestamp("connected_at", { mode: "date" }),
  disconnectedAt: timestamp("disconnected_at", { mode: "date" }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// Grupos/contatos que o usuário ESCOLHEU monitorar (consentimento LGPD).
// connectionId nulo = conversa de simulação manual (sem integração).
export const monitoredConversations = pgTable(
  "monitored_conversations",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    connectionId: text("connection_id").references(() => whatsappConnections.id, {
      onDelete: "set null",
    }),
    type: text("type", { enum: CONVERSATION_TYPES }).notNull().default("GRUPO"),
    externalConversationId: text("external_conversation_id"),
    displayName: text("display_name").notNull(),
    clientId: text("client_id").references(() => clients.id, { onDelete: "set null" }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("monitored_conversations_user_idx").on(t.userId)],
);

// Resumos de conversas — apenas síntese objetiva (pontos, objeções, dúvidas,
// pendências). Nunca armazenar credenciais nem transcrição integral sensível.
export const conversationSummaries = pgTable(
  "conversation_summaries",
  {
    id: id(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => monitoredConversations.id, { onDelete: "cascade" }),
    clientId: text("client_id").references(() => clients.id, { onDelete: "set null" }),
    summary: text("summary").notNull(),
    keyPoints: jsonb("key_points").$type<string[]>().notNull().default([]),
    objections: jsonb("objections").$type<string[]>().notNull().default([]),
    doubts: jsonb("doubts").$type<string[]>().notNull().default([]),
    pendingActions: jsonb("pending_actions").$type<string[]>().notNull().default([]),
    sentiment: text("sentiment", { enum: CONVERSATION_SENTIMENTS }).notNull().default("NEUTRO"),
    priority: text("priority", { enum: TASK_PRIORITIES }).notNull().default("MEDIA"),
    source: text("source").notNull().default("SIMULACAO"), // SIMULACAO | INTEGRACAO
    createdById: text("created_by_id").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("conversation_summaries_conv_idx").on(t.conversationId)],
);

export const copilotSuggestionsRelations = relations(copilotSuggestions, ({ one, many }) => ({
  user: one(users, { fields: [copilotSuggestions.userId], references: [users.id] }),
  client: one(clients, { fields: [copilotSuggestions.clientId], references: [clients.id] }),
  resolvedBy: one(users, {
    fields: [copilotSuggestions.resolvedById],
    references: [users.id],
    relationName: "copilotResolvedBy",
  }),
  actions: many(copilotActions),
}));

export const copilotActionsRelations = relations(copilotActions, ({ one }) => ({
  suggestion: one(copilotSuggestions, {
    fields: [copilotActions.suggestionId],
    references: [copilotSuggestions.id],
  }),
  approvedBy: one(users, { fields: [copilotActions.approvedById], references: [users.id] }),
}));

export const whatsappConnectionsRelations = relations(whatsappConnections, ({ one, many }) => ({
  user: one(users, { fields: [whatsappConnections.userId], references: [users.id] }),
  conversations: many(monitoredConversations),
}));

export const monitoredConversationsRelations = relations(monitoredConversations, ({ one, many }) => ({
  user: one(users, { fields: [monitoredConversations.userId], references: [users.id] }),
  connection: one(whatsappConnections, {
    fields: [monitoredConversations.connectionId],
    references: [whatsappConnections.id],
  }),
  client: one(clients, { fields: [monitoredConversations.clientId], references: [clients.id] }),
  summaries: many(conversationSummaries),
}));

export const conversationSummariesRelations = relations(conversationSummaries, ({ one }) => ({
  conversation: one(monitoredConversations, {
    fields: [conversationSummaries.conversationId],
    references: [monitoredConversations.id],
  }),
  client: one(clients, { fields: [conversationSummaries.clientId], references: [clients.id] }),
}));

// Dashboard personalizável por usuário: quais métricas aparecem, em que ordem,
// layout (nº de colunas), filtros padrão e alertas visíveis.
export const userDashboardConfigs = pgTable("user_dashboard_configs", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  visibleMetrics: jsonb("visible_metrics").$type<string[]>().notNull().default([]),
  metricOrder: jsonb("metric_order").$type<string[]>().notNull().default([]),
  layoutConfig: jsonb("layout_config").$type<{ columns?: number }>().notNull().default({}),
  defaultFilters: jsonb("default_filters").$type<Record<string, string>>().notNull().default({}),
  visibleAlerts: jsonb("visible_alerts").$type<string[]>().notNull().default([]),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const importLogs = pgTable("import_logs", {
  id: id(),
  source: text("source").notNull().default("CLICKUP"),
  fileName: text("file_name"),
  entity: text("entity").notNull(), // ex.: "clients", "tasks", "receivables"
  totalRows: integer("total_rows").notNull().default(0),
  importedRows: integer("imported_rows").notNull().default(0),
  skippedRows: integer("skipped_rows").notNull().default(0),
  errorRows: integer("error_rows").notNull().default(0),
  report: jsonb("report").$type<Record<string, unknown>>(),
  createdById: text("created_by_id").references(() => users.id),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Relations (para db.query com joins tipados)
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ one, many }) => ({
  teamMember: one(teamMembers, { fields: [users.id], references: [teamMembers.userId] }),
  userRoles: many(userRoles),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  userRoles: many(userRoles),
  rolePermissions: many(rolePermissions),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, { fields: [userRoles.userId], references: [users.id] }),
  role: one(roles, { fields: [userRoles.roleId], references: [roles.id] }),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
  permission: one(permissions, {
    fields: [rolePermissions.permissionId],
    references: [permissions.id],
  }),
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
  rolePermissions: many(rolePermissions),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  user: one(users, { fields: [teamMembers.userId], references: [users.id] }),
}));

export const clientsRelations = relations(clients, ({ one, many }) => ({
  strategist: one(users, { fields: [clients.strategistId], references: [users.id] }),
  trafficManager1: one(users, {
    fields: [clients.trafficManager1Id],
    references: [users.id],
  }),
  trafficManager2: one(users, {
    fields: [clients.trafficManager2Id],
    references: [users.id],
  }),
  mainResponsible: one(users, {
    fields: [clients.mainResponsibleId],
    references: [users.id],
  }),
  contacts: many(clientContacts),
  operationalProfile: one(clientOperationalProfiles, {
    fields: [clients.id],
    references: [clientOperationalProfiles.clientId],
  }),
  healthLogs: many(clientHealthLogs),
  pipelineStages: many(clientPipelineStages),
  tasks: many(tasks),
  digitalAssets: many(digitalAssets),
  meetings: many(clientMeetings),
  creativeRequests: many(creativeRequests),
  documents: many(documents),
}));

export const clientMeetingsRelations = relations(clientMeetings, ({ one }) => ({
  client: one(clients, { fields: [clientMeetings.clientId], references: [clients.id] }),
  createdBy: one(users, {
    fields: [clientMeetings.createdById],
    references: [users.id],
    relationName: "meetingCreatedBy",
  }),
  responsible: one(users, {
    fields: [clientMeetings.responsibleId],
    references: [users.id],
    relationName: "meetingResponsible",
  }),
}));

export const creativeRequestsRelations = relations(creativeRequests, ({ one }) => ({
  client: one(clients, { fields: [creativeRequests.clientId], references: [clients.id] }),
  requestedBy: one(users, { fields: [creativeRequests.requestedById], references: [users.id] }),
  copyResponsible: one(users, {
    fields: [creativeRequests.copyResponsibleId],
    references: [users.id],
  }),
  assignedTo: one(users, { fields: [creativeRequests.assignedToId], references: [users.id] }),
}));

export const documentsRelations = relations(documents, ({ one }) => ({
  client: one(clients, { fields: [documents.clientId], references: [clients.id] }),
  task: one(tasks, { fields: [documents.taskId], references: [tasks.id] }),
  digitalAsset: one(digitalAssets, { fields: [documents.digitalAssetId], references: [digitalAssets.id] }),
  createdBy: one(users, { fields: [documents.createdById], references: [users.id] }),
}));

export const clientContactsRelations = relations(clientContacts, ({ one }) => ({
  client: one(clients, { fields: [clientContacts.clientId], references: [clients.id] }),
}));

export const clientHealthLogsRelations = relations(clientHealthLogs, ({ one }) => ({
  client: one(clients, { fields: [clientHealthLogs.clientId], references: [clients.id] }),
  changedBy: one(users, { fields: [clientHealthLogs.changedById], references: [users.id] }),
}));

export const clientPipelineStagesRelations = relations(clientPipelineStages, ({ one }) => ({
  client: one(clients, {
    fields: [clientPipelineStages.clientId],
    references: [clients.id],
  }),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  client: one(clients, { fields: [tasks.clientId], references: [clients.id] }),
  project: one(projects, { fields: [tasks.projectId], references: [projects.id] }),
  digitalAsset: one(digitalAssets, {
    fields: [tasks.digitalAssetId],
    references: [digitalAssets.id],
  }),
  parent: one(tasks, {
    fields: [tasks.parentTaskId],
    references: [tasks.id],
    relationName: "subtasks",
  }),
  subtasks: many(tasks, { relationName: "subtasks" }),
  assignedTo: one(users, { fields: [tasks.assignedToId], references: [users.id] }),
  createdBy: one(users, { fields: [tasks.createdById], references: [users.id] }),
  assignees: many(taskAssignees),
  comments: many(taskComments),
  checklists: many(taskChecklists),
  attachments: many(taskAttachments),
  timeEntries: many(taskTimeEntries),
}));

export const taskAssigneesRelations = relations(taskAssignees, ({ one }) => ({
  task: one(tasks, { fields: [taskAssignees.taskId], references: [tasks.id] }),
  user: one(users, { fields: [taskAssignees.userId], references: [users.id] }),
}));

export const taskCommentsRelations = relations(taskComments, ({ one }) => ({
  task: one(tasks, { fields: [taskComments.taskId], references: [tasks.id] }),
  author: one(users, { fields: [taskComments.authorId], references: [users.id] }),
}));

export const taskChecklistsRelations = relations(taskChecklists, ({ one, many }) => ({
  task: one(tasks, { fields: [taskChecklists.taskId], references: [tasks.id] }),
  items: many(taskChecklistItems),
}));

export const taskChecklistItemsRelations = relations(taskChecklistItems, ({ one }) => ({
  checklist: one(taskChecklists, {
    fields: [taskChecklistItems.checklistId],
    references: [taskChecklists.id],
  }),
}));

export const taskAttachmentsRelations = relations(taskAttachments, ({ one }) => ({
  task: one(tasks, { fields: [taskAttachments.taskId], references: [tasks.id] }),
  uploadedBy: one(users, { fields: [taskAttachments.uploadedById], references: [users.id] }),
}));

export const taskTimeEntriesRelations = relations(taskTimeEntries, ({ one }) => ({
  task: one(tasks, { fields: [taskTimeEntries.taskId], references: [tasks.id] }),
  user: one(users, { fields: [taskTimeEntries.userId], references: [users.id] }),
}));

export const digitalAssetGroupsRelations = relations(digitalAssetGroups, ({ one, many }) => ({
  client: one(clients, { fields: [digitalAssetGroups.clientId], references: [clients.id] }),
  assets: many(digitalAssets),
}));

export const digitalAssetsRelations = relations(digitalAssets, ({ one, many }) => ({
  group: one(digitalAssetGroups, {
    fields: [digitalAssets.groupId],
    references: [digitalAssetGroups.id],
  }),
  client: one(clients, { fields: [digitalAssets.clientId], references: [clients.id] }),
  ownerUser: one(users, {
    fields: [digitalAssets.ownerUserId],
    references: [users.id],
    relationName: "assetOwner",
  }),
  assignedTo: one(users, {
    fields: [digitalAssets.assignedToId],
    references: [users.id],
    relationName: "assetAssignee",
  }),
  secrets: many(digitalAssetSecrets),
  attachments: many(digitalAssetAttachments),
  comments: many(digitalAssetComments),
  statusHistory: many(digitalAssetStatusHistory),
  auditLogs: many(digitalAssetAuditLogs),
  tasks: many(tasks),
}));

export const digitalAssetSecretsRelations = relations(digitalAssetSecrets, ({ one }) => ({
  asset: one(digitalAssets, {
    fields: [digitalAssetSecrets.assetId],
    references: [digitalAssets.id],
  }),
}));

export const digitalAssetAttachmentsRelations = relations(digitalAssetAttachments, ({ one }) => ({
  asset: one(digitalAssets, {
    fields: [digitalAssetAttachments.assetId],
    references: [digitalAssets.id],
  }),
  uploadedBy: one(users, {
    fields: [digitalAssetAttachments.uploadedById],
    references: [users.id],
  }),
}));

export const digitalAssetCommentsRelations = relations(digitalAssetComments, ({ one }) => ({
  asset: one(digitalAssets, {
    fields: [digitalAssetComments.assetId],
    references: [digitalAssets.id],
  }),
  author: one(users, { fields: [digitalAssetComments.authorId], references: [users.id] }),
}));

export const digitalAssetStatusHistoryRelations = relations(
  digitalAssetStatusHistory,
  ({ one }) => ({
    asset: one(digitalAssets, {
      fields: [digitalAssetStatusHistory.assetId],
      references: [digitalAssets.id],
    }),
    changedBy: one(users, {
      fields: [digitalAssetStatusHistory.changedById],
      references: [users.id],
    }),
  }),
);

export const digitalAssetAuditLogsRelations = relations(digitalAssetAuditLogs, ({ one }) => ({
  asset: one(digitalAssets, {
    fields: [digitalAssetAuditLogs.assetId],
    references: [digitalAssets.id],
  }),
  user: one(users, { fields: [digitalAssetAuditLogs.userId], references: [users.id] }),
}));

export const goalsRelations = relations(goals, ({ one, many }) => ({
  owner: one(users, { fields: [goals.ownerId], references: [users.id] }),
  targets: many(goalTargets),
}));

export const goalTargetsRelations = relations(goalTargets, ({ one }) => ({
  goal: one(goals, { fields: [goalTargets.goalId], references: [goals.id] }),
}));

export const automationRulesRelations = relations(automationRules, ({ many }) => ({
  executionLogs: many(automationExecutionLogs),
}));

export const automationExecutionLogsRelations = relations(
  automationExecutionLogs,
  ({ one }) => ({
    rule: one(automationRules, {
      fields: [automationExecutionLogs.ruleId],
      references: [automationRules.id],
    }),
  }),
);

export const formTemplatesRelations = relations(formTemplates, ({ many }) => ({
  submissions: many(formSubmissions),
}));

export const formSubmissionsRelations = relations(formSubmissions, ({ one }) => ({
  template: one(formTemplates, {
    fields: [formSubmissions.templateId],
    references: [formTemplates.id],
  }),
  client: one(clients, { fields: [formSubmissions.clientId], references: [clients.id] }),
}));

// ---------------------------------------------------------------------------
// Types inferidos
// ---------------------------------------------------------------------------

export type User = typeof users.$inferSelect;
export type UserStatus = (typeof USER_STATUSES)[number];
export type NewUser = typeof users.$inferInsert;
export type Role = typeof roles.$inferSelect;
export type Permission = typeof permissions.$inferSelect;
export type TeamMember = typeof teamMembers.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
export type ClientContact = typeof clientContacts.$inferSelect;
export type ClientOperationalProfile = typeof clientOperationalProfiles.$inferSelect;
export type ClientHealthLog = typeof clientHealthLogs.$inferSelect;
export type ClientPipelineStage = typeof clientPipelineStages.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type CreativeRequest = typeof creativeRequests.$inferSelect;
export type DigitalAssetGroup = typeof digitalAssetGroups.$inferSelect;
export type DigitalAsset = typeof digitalAssets.$inferSelect;
export type NewDigitalAsset = typeof digitalAssets.$inferInsert;
export type DigitalAssetSecret = typeof digitalAssetSecrets.$inferSelect;
export type DigitalAssetAttachment = typeof digitalAssetAttachments.$inferSelect;
export type DigitalAssetComment = typeof digitalAssetComments.$inferSelect;
export type DigitalAssetStatusHistoryEntry = typeof digitalAssetStatusHistory.$inferSelect;
export type DigitalAssetAuditLog = typeof digitalAssetAuditLogs.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type CopilotSuggestion = typeof copilotSuggestions.$inferSelect;
export type CopilotSuggestionType = (typeof COPILOT_SUGGESTION_TYPES)[number];
export type CopilotSuggestionStatus = (typeof COPILOT_SUGGESTION_STATUSES)[number];
export type CopilotAction = typeof copilotActions.$inferSelect;
export type CopilotActionType = (typeof COPILOT_ACTION_TYPES)[number];
export type CopilotActionStatus = (typeof COPILOT_ACTION_STATUSES)[number];
export type WhatsappConnection = typeof whatsappConnections.$inferSelect;
export type MonitoredConversation = typeof monitoredConversations.$inferSelect;
export type ConversationSummary = typeof conversationSummaries.$inferSelect;
export type GoalTarget = typeof goalTargets.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type ActivityLog = typeof activityLogs.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type AutomationRule = typeof automationRules.$inferSelect;
export type AutomationExecutionLog = typeof automationExecutionLogs.$inferSelect;
export type FormTemplate = typeof formTemplates.$inferSelect;
export type FormSubmission = typeof formSubmissions.$inferSelect;

export type TaskTemplate = typeof taskTemplates.$inferSelect;
export type ClientMeeting = typeof clientMeetings.$inferSelect;
export type ImportLog = typeof importLogs.$inferSelect;
export type AgencyService = typeof agencyServices.$inferSelect;
export type AppSetting = typeof appSettings.$inferSelect;
export type UserDashboardConfig = typeof userDashboardConfigs.$inferSelect;
export type ConfigOptionGroup = typeof configOptionGroups.$inferSelect;
export type ConfigOption = typeof configOptions.$inferSelect;

export type RoleName = (typeof ROLE_NAMES)[number];
export type ClientStatus = (typeof CLIENT_STATUSES)[number];
export type HealthStatus = (typeof HEALTH_STATUSES)[number];
export type AdsStatus = (typeof ADS_STATUSES)[number];
export type PipelineStage = (typeof PIPELINE_STAGES)[number];
export type TaskType = (typeof TASK_TYPES)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export type CreativeStatus = (typeof CREATIVE_STATUSES)[number];
export type AutomationTrigger = (typeof AUTOMATION_TRIGGERS)[number];
export type AutomationActionType = (typeof AUTOMATION_ACTIONS)[number];
export type TemplateRole = (typeof TEMPLATE_ROLES)[number];
export type AssetGroupType = (typeof ASSET_GROUP_TYPES)[number];
export type AssetType = (typeof ASSET_TYPES)[number];
export type AssetPlatform = (typeof ASSET_PLATFORMS)[number];
export type AssetStatus = (typeof ASSET_STATUSES)[number];
export type AssetPriority = (typeof ASSET_PRIORITIES)[number];
export type SecretType = (typeof SECRET_TYPES)[number];
export type AssetCommentType = (typeof ASSET_COMMENT_TYPES)[number];
export type AssetAuditAction = (typeof ASSET_AUDIT_ACTIONS)[number];
