import { db } from "./index";
import {
  agencyServices,
  appSettings,
  automationRules,
  formTemplates,
  roles,
  ROLE_NAMES,
  taskTemplates,
  teamMembers,
  userRoles,
  users,
  type TemplateItem,
} from "./schema";
import { hashPassword } from "../lib/auth/password";
import { materializeAllGroups } from "../lib/config-options";

/**
 * Seed de BASELINE — apenas configuração operacional do sistema:
 * papéis, templates de tarefas, automações, serviços da agência,
 * formulários e feature flags. Idempotente (onConflictDoNothing).
 *
 * NÃO cria dados de exemplo (clientes, tarefas, documentos, ativos).
 * Um usuário OWNER inicial é criado SOMENTE se o banco não tiver
 * nenhum usuário (bootstrap de ambiente novo) — troque a senha no
 * primeiro login.
 */
async function seed() {
  console.log("🌱 Seed COP B2C (baseline — sem dados de exemplo)...");

  // --- Papéis ------------------------------------------------------------------
  // Permissões NÃO são persistidas: a fonte de verdade é o mapa estático
  // ROLE_PERMISSIONS em src/lib/auth/permissions.ts (usado pelos guards).
  await db
    .insert(roles)
    .values(ROLE_NAMES.map((name) => ({ name })))
    .onConflictDoNothing();
  const allRoles = await db.select().from(roles);
  const roleByName = new Map(allRoles.map((r) => [r.name, r.id]));

  // --- Bootstrap: OWNER inicial apenas em banco sem usuários --------------------
  let bootstrapOwnerId: string | null = null;
  const existingUsers = await db.select({ id: users.id }).from(users).limit(1);
  if (existingUsers.length === 0) {
    const [owner] = await db
      .insert(users)
      .values({
        name: "Owner",
        email: "owner@b2cgestao.com.br",
        passwordHash: await hashPassword("cop123456"),
      })
      .returning();
    await db.insert(userRoles).values({ userId: owner.id, roleId: roleByName.get("OWNER")! });
    await db.insert(teamMembers).values({ userId: owner.id, position: "Owner", status: "ATIVO" });
    bootstrapOwnerId = owner.id;
    console.log("   ⚠️  OWNER inicial criado: owner@b2cgestao.com.br / cop123456 — TROQUE A SENHA no primeiro login.");
  }

  // --- Templates operacionais ----------------------------------------------------
  const t = (items: (string | TemplateItem)[]): TemplateItem[] =>
    items.map((i) => (typeof i === "string" ? { title: i } : i));

  await db
    .insert(taskTemplates)
    .values([
      {
        name: "Onboarding de Cliente", slug: "onboarding-cliente", taskType: "OPERACIONAL",
        pipelineStage: "NOVO_CLIENTE",
        description: "Checklist padrão de entrada de cliente novo",
        items: t([
          { title: "Criar grupo de atendimento", dueOffsetDays: 1, role: "GESTOR" },
          { title: "Solicitar acessos", dueOffsetDays: 1, role: "GESTOR" },
          { title: "Solicitar briefing", dueOffsetDays: 2, role: "ESTRATEGISTA" },
          { title: "Confirmar decisor", dueOffsetDays: 2, role: "GESTOR" },
          { title: "Confirmar plano contratado", dueOffsetDays: 2, role: "GESTOR" },
          { title: "Confirmar canais de comunicação", dueOffsetDays: 3, role: "GESTOR" },
          { title: "Registrar data de entrada", dueOffsetDays: 1, role: "GESTOR" },
          { title: "Vincular responsáveis", dueOffsetDays: 1, role: "GESTOR" },
        ]),
        createdById: bootstrapOwnerId,
      },
      {
        name: "Integração Meta", slug: "integracao-meta", taskType: "OPERACIONAL",
        pipelineStage: "INTEGRACAO_META",
        items: t([
          { title: "Solicitar acesso ao Business Manager", dueOffsetDays: 1, role: "GESTOR" },
          { title: "Verificar conta de anúncios", dueOffsetDays: 2, role: "GESTOR" },
          { title: "Verificar pixel", dueOffsetDays: 2, role: "GESTOR" },
          { title: "Verificar página do Facebook", dueOffsetDays: 2, role: "GESTOR" },
          { title: "Verificar Instagram", dueOffsetDays: 2, role: "GESTOR" },
          { title: "Verificar forma de pagamento", dueOffsetDays: 3, role: "GESTOR" },
          { title: "Validar domínio", dueOffsetDays: 3, role: "GESTOR" },
          { title: "Registrar observações", dueOffsetDays: 3, role: "GESTOR" },
        ]),
        createdById: bootstrapOwnerId,
      },
      {
        name: "Integração Google", slug: "integracao-google", taskType: "OPERACIONAL",
        pipelineStage: "INTEGRACAO_GOOGLE",
        items: t([
          { title: "Solicitar acesso ao Google Ads", dueOffsetDays: 1, role: "GESTOR" },
          { title: "Verificar conta", dueOffsetDays: 2, role: "GESTOR" },
          { title: "Verificar conversões", dueOffsetDays: 3, role: "GESTOR" },
          { title: "Verificar palavras-chave iniciais", dueOffsetDays: 3, role: "GESTOR" },
          { title: "Verificar Google Meu Negócio se aplicável", dueOffsetDays: 4, role: "GESTOR" },
          { title: "Validar forma de pagamento", dueOffsetDays: 4, role: "GESTOR" },
        ]),
        createdById: bootstrapOwnerId,
      },
      {
        name: "Pesquisa de Mercado", slug: "pesquisa-mercado", taskType: "OPERACIONAL",
        pipelineStage: "PESQUISA_DE_MERCADO",
        items: t([
          { title: "Analisar concorrentes", dueOffsetDays: 3, role: "ESTRATEGISTA" },
          { title: "Mapear ofertas", dueOffsetDays: 3, role: "ESTRATEGISTA" },
          { title: "Mapear diferenciais", dueOffsetDays: 4, role: "ESTRATEGISTA" },
          { title: "Mapear objeções", dueOffsetDays: 4, role: "ESTRATEGISTA" },
          { title: "Mapear praça", dueOffsetDays: 5, role: "ESTRATEGISTA" },
          { title: "Registrar oportunidades", dueOffsetDays: 5, role: "ESTRATEGISTA" },
        ]),
        createdById: bootstrapOwnerId,
      },
      {
        name: "Diagnóstico Estratégico", slug: "diagnostico-estrategico", taskType: "OPERACIONAL",
        pipelineStage: "DIAGNOSTICO_ESTRATEGICO",
        items: t([
          { title: "Revisar briefing", dueOffsetDays: 1, role: "ESTRATEGISTA" },
          { title: "Definir objetivo", dueOffsetDays: 2, role: "ESTRATEGISTA" },
          { title: "Definir público", dueOffsetDays: 2, role: "ESTRATEGISTA" },
          { title: "Definir oferta", dueOffsetDays: 3, role: "ESTRATEGISTA" },
          { title: "Definir canais", dueOffsetDays: 3, role: "ESTRATEGISTA" },
          { title: "Definir próximos passos", dueOffsetDays: 3, role: "ESTRATEGISTA" },
        ]),
        createdById: bootstrapOwnerId,
      },
      {
        name: "Reunião Mensal", slug: "reuniao-mensal", taskType: "OPERACIONAL",
        pipelineStage: "BASE_DE_CLIENTES",
        description: "Checklist anual de reuniões mensais de acompanhamento",
        items: t([
          "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
          "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
        ]),
        createdById: bootstrapOwnerId,
      },
      {
        name: "Cliente Crítico", slug: "cliente-critico", taskType: "OPERACIONAL",
        pipelineStage: "CLIENTE_CRITICO",
        items: t([
          { title: "Descrever problema", dueOffsetDays: 1, role: "GESTOR" },
          { title: "Identificar causa provável", dueOffsetDays: 1, role: "GESTOR" },
          { title: "Definir plano de ação", dueOffsetDays: 2, role: "ESTRATEGISTA" },
          { title: "Definir responsável", dueOffsetDays: 2, role: "GESTOR" },
          { title: "Definir prazo de revisão", dueOffsetDays: 2, role: "GESTOR" },
          { title: "Registrar retorno ao cliente", dueOffsetDays: 3, role: "GESTOR" },
        ]),
        createdById: bootstrapOwnerId,
      },
      {
        name: "Social Media", slug: "social-media", taskType: "SOCIAL_MEDIA",
        items: t([
          { title: "Planejamento", dueOffsetDays: 1, role: "SOCIAL_MEDIA" },
          { title: "Roteiro", dueOffsetDays: 2, role: "SOCIAL_MEDIA" },
          { title: "Design", dueOffsetDays: 4, role: "DESIGNER" },
          { title: "Legenda", dueOffsetDays: 4, role: "SOCIAL_MEDIA" },
          { title: "Aprovação", dueOffsetDays: 5, role: "GESTOR" },
          { title: "Postagem", dueOffsetDays: 6, role: "SOCIAL_MEDIA" },
        ]),
        createdById: bootstrapOwnerId,
      },
      {
        name: "Cliente Oculto", slug: "cliente-oculto", taskType: "CLIENTE_OCULTO",
        items: t([
          { title: "Definir roteiro de contato", dueOffsetDays: 1, role: "GESTOR" },
          { title: "Executar contato como cliente oculto", dueOffsetDays: 3, role: "GESTOR" },
          { title: "Registrar tempo de resposta e abordagem", dueOffsetDays: 3, role: "GESTOR" },
          { title: "Enviar relatório ao cliente", dueOffsetDays: 5, role: "ESTRATEGISTA" },
        ]),
        createdById: bootstrapOwnerId,
      },
      {
        name: "CRM/IA", slug: "crm-ia", taskType: "CRM",
        items: t([
          { title: "Mapear funil de atendimento", dueOffsetDays: 2, role: "ESTRATEGISTA" },
          { title: "Configurar automações de CRM", dueOffsetDays: 4, role: "GESTOR" },
          { title: "Treinar respostas da IA", dueOffsetDays: 5, role: "GESTOR" },
          { title: "Validar com o cliente", dueOffsetDays: 7, role: "GESTOR" },
        ]),
        createdById: bootstrapOwnerId,
      },
      {
        name: "Solicitação de Criativo", slug: "solicitacao-criativo", taskType: "CRIATIVO",
        items: t([
          { title: "Escrever copy", dueOffsetDays: 2, role: "SOCIAL_MEDIA" },
          { title: "Produzir design/edição", dueOffsetDays: 4, role: "DESIGNER" },
          { title: "Enviar para aprovação", dueOffsetDays: 5, role: "GESTOR" },
        ]),
        createdById: bootstrapOwnerId,
      },
    ])
    .onConflictDoNothing();

  // --- Automações padrão -----------------------------------------------------------
  const existingRules = await db.select({ id: automationRules.id }).from(automationRules).limit(1);
  if (existingRules.length === 0) {
    await db.insert(automationRules).values([
      {
        name: "Cliente criado → aplicar onboarding",
        triggerType: "CLIENT_CREATED",
        actions: [{ type: "APPLY_TEMPLATE", params: { templateSlug: "onboarding-cliente" } }],
        scope: "GLOBAL", createdById: bootstrapOwnerId,
      },
      {
        name: "Movido p/ Integração Meta → tarefas de integração",
        triggerType: "CLIENT_STAGE_CHANGED",
        conditions: { toStage: "INTEGRACAO_META" },
        actions: [{ type: "APPLY_TEMPLATE", params: { templateSlug: "integracao-meta" } }],
        scope: "OPERACIONAL", createdById: bootstrapOwnerId,
      },
      {
        name: "Movido p/ Integração Google → tarefas de integração",
        triggerType: "CLIENT_STAGE_CHANGED",
        conditions: { toStage: "INTEGRACAO_GOOGLE" },
        actions: [{ type: "APPLY_TEMPLATE", params: { templateSlug: "integracao-google" } }],
        scope: "OPERACIONAL", createdById: bootstrapOwnerId,
      },
      {
        name: "Movido p/ Base de Clientes → checklist de reunião mensal",
        triggerType: "CLIENT_STAGE_CHANGED",
        conditions: { toStage: "BASE_DE_CLIENTES" },
        actions: [{ type: "APPLY_TEMPLATE", params: { templateSlug: "reuniao-mensal", asChecklist: true } }],
        scope: "OPERACIONAL", createdById: bootstrapOwnerId,
      },
      {
        name: "Cliente crítico → tarefa de plano de ação",
        triggerType: "CLIENT_HEALTH_CHANGED",
        conditions: { toHealth: "CRITICO" },
        actions: [
          { type: "APPLY_TEMPLATE", params: { templateSlug: "cliente-critico" } },
          { type: "SEND_NOTIFICATION", params: { toRole: "GESTOR_OPERACIONAL", title: "Cliente crítico", type: "ALERTA" } },
        ],
        scope: "GLOBAL", createdById: bootstrapOwnerId,
      },
      {
        name: "Cliente perdido → encerrar campanhas e revisar ativos",
        triggerType: "CLIENT_MARKED_LOST",
        actions: [
          { type: "UPDATE_CLIENT_FIELD", params: { field: "adsStatus", value: "SEM_CAMPANHA" } },
          { type: "SEND_NOTIFICATION", params: { toRole: "GESTOR_OPERACIONAL", title: "Cliente perdido — revisar ativos digitais e remover acessos", type: "ALERTA" } },
          { type: "CREATE_ACTIVITY_LOG", params: { action: "client.assetsReviewNeeded" } },
        ],
        scope: "GLOBAL", createdById: bootstrapOwnerId,
      },
      {
        name: "Tarefa vencida → notificar responsável",
        triggerType: "TASK_OVERDUE",
        actions: [{ type: "SEND_NOTIFICATION", params: { toAssignee: true, title: "Tarefa vencida", type: "TAREFA" } }],
        scope: "GLOBAL", createdById: bootstrapOwnerId,
      },
      {
        name: "Tarefa sem responsável → alertar gestor operacional",
        triggerType: "TASK_CREATED",
        conditions: { withoutAssignee: true },
        actions: [{ type: "SEND_NOTIFICATION", params: { toRole: "GESTOR_OPERACIONAL", title: "Tarefa criada sem responsável", type: "ALERTA" } }],
        scope: "OPERACIONAL", createdById: bootstrapOwnerId,
      },
      {
        name: "Ativo bloqueado → alerta operacional",
        triggerType: "ASSET_STATUS_CHANGED",
        conditions: { toStatus: "BLOQUEADA" },
        actions: [{ type: "SEND_NOTIFICATION", params: { toRole: "GESTOR_OPERACIONAL", title: "Ativo digital bloqueado", type: "ALERTA" } }],
        scope: "GLOBAL", createdById: bootstrapOwnerId,
      },
      {
        name: "Formulário de reunião mensal → salvar no histórico",
        triggerType: "FORM_SUBMITTED",
        conditions: { formSlug: "reuniao-mensal" },
        actions: [{ type: "ADD_COMMENT", params: { toClientHistory: true } }],
        scope: "GLOBAL", createdById: bootstrapOwnerId,
      },
    ]);
  }

  // --- Serviços da agência + feature flags -----------------------------------
  await db
    .insert(agencyServices)
    .values(
      (
        [
          ["Meta Ads", "Tráfego", "blue"],
          ["Google Ads", "Tráfego", "red"],
          ["Social Media", "Social", "purple"],
          ["Criativos", "Criação", "amber"],
          ["CRM/IA", "Tecnologia", "cyan"],
          ["Google Meu Negócio", "Tráfego", "green"],
          ["SEO", "Tráfego", "green"],
          ["Landing Page", "Criação", "amber"],
          ["Consultoria Comercial", "Comercial", "zinc"],
          ["WhatsApp/Automação", "Tecnologia", "cyan"],
          ["Relatórios", "Operacional", "blue"],
          ["Cliente Oculto", "Operacional", "zinc"],
        ] as const
      ).map(([name, category, color], i) => ({ name, category, color, order: i })),
    )
    .onConflictDoNothing();
  await db
    .insert(appSettings)
    .values({ key: "feature_flags", value: { copiloto: false, google_drive: false, google_meet: false } })
    .onConflictDoNothing();

  // --- Formulários -----------------------------------------------------------------------
  await db
    .insert(formTemplates)
    .values([
      {
        name: "Onboarding de Cliente", slug: "onboarding",
        description: "Coleta inicial de dados do cliente",
        fields: [
          { name: "empresa", label: "Nome da empresa", type: "text", required: true },
          { name: "nicho", label: "Nicho", type: "text", required: true },
          { name: "orcamento_diario", label: "Orçamento diário (R$)", type: "number", required: true },
          { name: "objetivo", label: "Objetivo principal", type: "textarea", required: true },
        ],
      },
      {
        name: "Briefing de Campanha", slug: "briefing-campanha",
        fields: [
          { name: "cliente", label: "Cliente", type: "text", required: true },
          { name: "objetivo", label: "Objetivo", type: "text", required: true },
          { name: "publico", label: "Público-alvo", type: "textarea", required: true },
          { name: "oferta", label: "Oferta", type: "textarea", required: true },
        ],
      },
      {
        name: "Solicitação de Criativos", slug: "solicitacao-criativos",
        fields: [
          { name: "cliente", label: "Cliente", type: "text", required: true },
          { name: "formato", label: "Formato", type: "select", required: true, options: ["Estático", "Carrossel", "Vídeo", "Story"] },
          { name: "briefing", label: "Briefing", type: "textarea", required: true },
          { name: "prazo", label: "Prazo", type: "date", required: false },
        ],
      },
      {
        name: "Reunião Mensal", slug: "reuniao-mensal",
        fields: [
          { name: "cliente", label: "Cliente", type: "text", required: true },
          { name: "data", label: "Data", type: "date", required: true },
          { name: "resumo", label: "Resumo da reunião", type: "textarea", required: true },
          { name: "proximos_passos", label: "Próximos passos", type: "textarea", required: false },
        ],
      },
      {
        name: "Cadastro de Ativo Digital", slug: "cadastro-ativo-digital",
        description: "Solicitação interna de cadastro de conta/perfil no Banco de Ativos Digitais",
        fields: [
          { name: "cliente", label: "Cliente (ou 'interno')", type: "text", required: true },
          { name: "grupo", label: "Grupo/lista", type: "text", required: false },
          { name: "tipo", label: "Tipo de ativo", type: "select", required: true, options: ["Conta Facebook", "Conta Instagram", "Conta TikTok", "Business Manager", "Conta de anúncio", "Google Ads", "E-mail", "WordPress", "Domínio/Hospedagem", "Perfil de navegador", "Outro"] },
          { name: "plataforma", label: "Plataforma", type: "text", required: false },
          { name: "titulo", label: "Título do ativo", type: "text", required: true },
          { name: "status", label: "Status atual", type: "select", required: true, options: ["Ativa", "Pronta para uso", "Análise solicitada", "Bloqueada", "Precisa de documentos", "Sendo esquentada", "Não informado"] },
          { name: "login_url", label: "URL de login", type: "text", required: false },
          { name: "profile_url", label: "URL do perfil", type: "text", required: false },
          { name: "ids_externos", label: "IDs externos (BM, conta, página...)", type: "textarea", required: false },
          { name: "responsavel", label: "Responsável", type: "text", required: false },
          { name: "observacoes", label: "Observações (NUNCA cole senhas aqui — cadastre no módulo)", type: "textarea", required: false },
        ],
      },
      {
        name: "Registro de Problemas", slug: "registro-problemas",
        fields: [
          { name: "cliente", label: "Cliente", type: "text", required: true },
          { name: "gravidade", label: "Gravidade", type: "select", required: true, options: ["Baixa", "Média", "Alta", "Crítica"] },
          { name: "descricao", label: "Descrição", type: "textarea", required: true },
        ],
      },
    ])
    .onConflictDoNothing();

  await materializeAllGroups();

  console.log("✅ Seed baseline concluído (sem dados de exemplo).");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Seed falhou:", err);
    process.exit(1);
  });
