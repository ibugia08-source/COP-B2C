// Labels PT-BR e cores para todos os enums do sistema (fonte única para a UI).

export type Tone = "green" | "amber" | "red" | "blue" | "purple" | "zinc" | "cyan";

export const TONE_CLASSES: Record<Tone, string> = {
  green: "bg-emerald-950/80 text-emerald-300 border-emerald-900",
  amber: "bg-amber-950/80 text-amber-300 border-amber-900",
  red: "bg-red-950/80 text-red-300 border-red-900",
  blue: "bg-sky-950/80 text-sky-300 border-sky-900",
  purple: "bg-purple-950/80 text-purple-300 border-purple-900",
  zinc: "bg-zinc-800 text-zinc-300 border-zinc-700",
  cyan: "bg-cyan-950/80 text-cyan-300 border-cyan-900",
};

type Meta = { label: string; tone: Tone };

export const CLIENT_STATUS_META: Record<string, Meta> = {
  LEAD: { label: "Lead", tone: "purple" },
  ONBOARDING: { label: "Onboarding", tone: "blue" },
  IMPLANTACAO: { label: "Implantação", tone: "cyan" },
  ATIVO: { label: "Ativo", tone: "green" },
  EM_RISCO: { label: "Em risco", tone: "amber" },
  PAUSADO: { label: "Pausado", tone: "zinc" },
  PERDIDO: { label: "Perdido", tone: "red" },
};

export const HEALTH_META: Record<string, Meta> = {
  ESTAVEL: { label: "Estável", tone: "green" },
  OBSERVACAO: { label: "Observação", tone: "amber" },
  CRITICO: { label: "Crítico", tone: "red" },
};

export const ADS_META: Record<string, Meta> = {
  ATIVO: { label: "Ads ativo", tone: "green" },
  PAUSADO: { label: "Ads pausado", tone: "amber" },
  SEM_CAMPANHA: { label: "Sem campanha", tone: "zinc" },
};

export const PIPELINE_STAGE_META: Record<string, Meta> = {
  NOVO_CLIENTE: { label: "Novo cliente", tone: "purple" },
  CRIACAO_DE_GRUPO: { label: "Criação de grupo", tone: "blue" },
  INTEGRACAO_META: { label: "Integração Meta", tone: "blue" },
  INTEGRACAO_GOOGLE: { label: "Integração Google", tone: "blue" },
  PESQUISA_DE_MERCADO: { label: "Pesquisa de mercado", tone: "cyan" },
  DIAGNOSTICO_ESTRATEGICO: { label: "Diagnóstico estratégico", tone: "cyan" },
  ESTUDO_DE_FUNIL: { label: "Estudo de funil", tone: "cyan" },
  INTEGRACAO_SOCIAL_MEDIA: { label: "Integração Social Media", tone: "blue" },
  CRM: { label: "CRM", tone: "purple" },
  BASE_DE_CLIENTES: { label: "Base de clientes", tone: "green" },
  EM_OBSERVACAO: { label: "Em observação", tone: "amber" },
  CLIENTE_CRITICO: { label: "Cliente crítico", tone: "red" },
  PAUSADO: { label: "Pausado", tone: "zinc" },
  CLIENTE_PERDIDO: { label: "Cliente perdido", tone: "red" },
};

export const TASK_STATUS_META: Record<string, Meta> = {
  BACKLOG: { label: "Backlog", tone: "zinc" },
  A_FAZER: { label: "A fazer", tone: "blue" },
  EM_ANDAMENTO: { label: "Em andamento", tone: "cyan" },
  AGUARDANDO_CLIENTE: { label: "Aguardando cliente", tone: "amber" },
  AGUARDANDO_EQUIPE: { label: "Aguardando equipe", tone: "amber" },
  EM_REVISAO: { label: "Em revisão", tone: "purple" },
  BLOQUEADA: { label: "Bloqueada", tone: "red" },
  CONCLUIDA: { label: "Concluída", tone: "green" },
  CANCELADA: { label: "Cancelada", tone: "zinc" },
};

export const TASK_TYPE_META: Record<string, Meta> = {
  OPERACIONAL: { label: "Operacional", tone: "blue" },
  DIARIA: { label: "Diária", tone: "cyan" },
  SEMANAL: { label: "Semanal", tone: "cyan" },
  SOCIAL_MEDIA: { label: "Social Media", tone: "purple" },
  CRIATIVO: { label: "Criativo", tone: "purple" },
  PROJETO: { label: "Projeto", tone: "blue" },
  CLIENTE_OCULTO: { label: "Cliente oculto", tone: "zinc" },
  CRM: { label: "CRM", tone: "purple" },
};

export const PRIORITY_META: Record<string, Meta> = {
  BAIXA: { label: "Baixa", tone: "zinc" },
  MEDIA: { label: "Média", tone: "blue" },
  ALTA: { label: "Alta", tone: "amber" },
  URGENTE: { label: "Urgente", tone: "red" },
};

export const CREATIVE_STATUS_META: Record<string, Meta> = {
  SOLICITADO: { label: "Solicitado", tone: "purple" },
  EM_ROTEIRO: { label: "Em roteiro", tone: "blue" },
  EM_DESIGN: { label: "Em design", tone: "cyan" },
  EM_EDICAO: { label: "Em edição", tone: "cyan" },
  AGUARDANDO_APROVACAO: { label: "Aguardando aprovação", tone: "amber" },
  APROVADO: { label: "Aprovado", tone: "green" },
  REPROVADO: { label: "Reprovado", tone: "red" },
  PUBLICADO: { label: "Publicado", tone: "green" },
  CANCELADO: { label: "Cancelado", tone: "zinc" },
};

// ------------------------- Banco de Ativos Digitais -------------------------

export const ASSET_STATUS_META: Record<string, Meta> = {
  ATIVA: { label: "Ativa", tone: "green" },
  PRONTA_PARA_USO: { label: "Pronta para uso", tone: "cyan" },
  ANALISE_SOLICITADA: { label: "Análise solicitada", tone: "purple" },
  BLOQUEADA: { label: "Bloqueada", tone: "red" },
  PRECISA_DE_DOCUMENTOS: { label: "Precisa de documentos", tone: "amber" },
  NAO_INFORMADO: { label: "Não informado", tone: "zinc" },
  SENDO_ESQUENTADA: { label: "Sendo esquentada", tone: "amber" },
  EM_REVISAO: { label: "Em revisão", tone: "purple" },
  PAUSADA: { label: "Pausada", tone: "zinc" },
  ARQUIVADA: { label: "Arquivada", tone: "zinc" },
};

export const ASSET_PRIORITY_META: Record<string, Meta> = {
  BAIXA: { label: "Baixa", tone: "zinc" },
  MEDIA: { label: "Média", tone: "blue" },
  ALTA: { label: "Alta", tone: "amber" },
  CRITICA: { label: "Crítica", tone: "red" },
};

export const ASSET_TYPE_LABEL: Record<string, string> = {
  FACEBOOK_ACCOUNT: "Conta Facebook",
  INSTAGRAM_ACCOUNT: "Conta Instagram",
  TIKTOK_ACCOUNT: "Conta TikTok",
  GOOGLE_ACCOUNT: "Conta Google",
  GOOGLE_ADS: "Google Ads",
  META_BUSINESS_MANAGER: "Business Manager",
  META_AD_ACCOUNT: "Conta de anúncio Meta",
  FACEBOOK_PAGE: "Página do Facebook",
  WHATSAPP_BUSINESS: "WhatsApp Business",
  EMAIL_ACCOUNT: "E-mail",
  WORDPRESS: "WordPress",
  LANDING_PAGE: "Landing Page",
  DOMAIN: "Domínio",
  HOSTING: "Hospedagem",
  CRM: "CRM",
  ANTIDETECT_PROFILE: "Perfil antidetect",
  BROWSER_PROFILE_BACKUP: "Backup de perfil",
  TOKEN: "Token",
  API_KEY: "API Key",
  OTHER: "Outro",
};

export const ASSET_PLATFORM_LABEL: Record<string, string> = {
  META: "Meta",
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  GOOGLE: "Google",
  TIKTOK: "TikTok",
  WORDPRESS: "WordPress",
  HOSTINGER: "Hostinger",
  GODADDY: "GoDaddy",
  REGISTRO_BR: "Registro.br",
  CLOUDFLARE: "Cloudflare",
  WHATSAPP: "WhatsApp",
  RD_STATION: "RD Station",
  GOHIGHLEVEL: "GoHighLevel",
  CHATZAP: "ChatZap",
  ZAPTOS: "Zaptos",
  DOLPHIN_ANTY: "Dolphin Anty",
  OUTRA: "Outra",
};

export const ASSET_GROUP_TYPE_LABEL: Record<string, string> = {
  CLIENTE: "Cliente",
  INTERNO: "Interno",
  PLATAFORMA: "Plataforma",
  OPERACAO: "Operação",
  OUTRO: "Outro",
};

export const SECRET_TYPE_LABEL: Record<string, string> = {
  USERNAME: "Usuário/login",
  PASSWORD: "Senha",
  EMAIL: "E-mail",
  EMAIL_PASSWORD: "Senha do e-mail",
  RECOVERY_EMAIL: "E-mail de recuperação",
  TOKEN: "Token",
  API_KEY: "API Key",
  BACKUP_CODE: "Código de backup",
  TWO_FACTOR_SECRET: "Segredo 2FA",
  OTHER: "Outro",
};

export const ASSET_COMMENT_TYPE_META: Record<string, Meta> = {
  COMENTARIO: { label: "Comentário", tone: "zinc" },
  FEEDBACK: { label: "Feedback", tone: "blue" },
  ANALISE: { label: "Análise", tone: "purple" },
  ALERTA: { label: "Alerta", tone: "red" },
  ALTERACAO_STATUS: { label: "Mudança de status", tone: "amber" },
  OUTRO: { label: "Outro", tone: "zinc" },
};

export const GOAL_STATUS_META: Record<string, Meta> = {
  PLANEJADA: { label: "Planejada", tone: "zinc" },
  EM_EXECUCAO: { label: "Em execução", tone: "blue" },
  FINALIZANDO: { label: "Finalizando", tone: "amber" },
  FINALIZADA: { label: "Finalizada", tone: "green" },
  CONCLUIDA: { label: "Concluída", tone: "green" },
};

export const AGENCY_BRAND_META: Record<string, Meta> = {
  B2C_GESTAO: { label: "B2C Gestão", tone: "blue" },
  LIFE_ADS: { label: "Life Ads", tone: "purple" },
};

export const BUSINESS_MODEL_LABEL: Record<string, string> = {
  ECOMMERCE: "E-commerce",
  NEGOCIO_LOCAL: "Negócio local",
  OUTROS: "Outros",
};

/** Formata valores monetários operacionais (ex.: verba diária de anúncio). */
export function formatMoney(v: number | null | undefined): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

export function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(d);
}

export function isOverdue(due: Date | null | undefined, doneAt?: Date | null): boolean {
  return !!due && !doneAt && due.getTime() < Date.now();
}
