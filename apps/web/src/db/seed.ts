import { db } from "./index";
import {
  agencyServices,
  appSettings,
  automationRules,
  clientHealthLogs,
  clientMeetings,
  clientOperationalProfiles,
  clients,
  digitalAssetComments,
  digitalAssetGroups,
  digitalAssetSecrets,
  digitalAssets,
  documents,
  formTemplates,
  goals,
  roles,
  ROLE_NAMES,
  taskChecklistItems,
  taskChecklists,
  tasks,
  taskTemplates,
  teamMembers,
  userRoles,
  users,
  type RoleName,
  type TemplateItem,
} from "./schema";
import { hashPassword } from "../lib/auth/password";
import { encryptSecret } from "../lib/crypto";
import { materializeAllGroups } from "../lib/config-options";

async function seed() {
  console.log("🌱 Seed COP B2C (v3 — Banco de Ativos Digitais)...");

  // --- Papéis ------------------------------------------------------------------
  // Permissões NÃO são persistidas: a fonte de verdade é o mapa estático
  // ROLE_PERMISSIONS em src/lib/auth/permissions.ts (usado pelos guards).
  await db
    .insert(roles)
    .values(ROLE_NAMES.map((name) => ({ name })))
    .onConflictDoNothing();
  const allRoles = await db.select().from(roles);
  const roleByName = new Map(allRoles.map((r) => [r.name, r.id]));

  // --- Usuários (senha padrão de dev: "cop123456") ----------------------------
  const defaultHash = await hashPassword("cop123456");
  const seedUsers: { name: string; email: string; role: RoleName; position: string }[] = [
    { name: "Owner B2C", email: "owner@b2cgestao.com.br", role: "OWNER", position: "CEO" },
    { name: "Admin B2C", email: "admin@b2cgestao.com.br", role: "ADMIN", position: "COO" },
    { name: "Gabriela Operação", email: "operacao@b2cgestao.com.br", role: "GESTOR_OPERACIONAL", position: "Gestora Operacional" },
    { name: "Tiago Tráfego", email: "trafego1@b2cgestao.com.br", role: "GESTOR_TRAFEGO", position: "Gestor de Tráfego" },
    { name: "Marina Tráfego", email: "trafego2@b2cgestao.com.br", role: "GESTOR_TRAFEGO", position: "Gestora de Tráfego" },
    { name: "Sofia Social", email: "social@b2cgestao.com.br", role: "SOCIAL_MEDIA", position: "Social Media" },
    { name: "Diego Designer", email: "designer@b2cgestao.com.br", role: "DESIGNER", position: "Designer" },
    { name: "Carlos Comercial", email: "comercial@b2cgestao.com.br", role: "COMERCIAL", position: "Comercial" },
  ];

  await db
    .insert(users)
    .values(seedUsers.map((u) => ({ name: u.name, email: u.email, passwordHash: defaultHash })))
    .onConflictDoNothing();
  const allUsers = await db.select().from(users);
  const userByEmail = new Map(allUsers.map((u) => [u.email, u.id]));
  const uid = (email: string) => userByEmail.get(email)!;

  await db
    .insert(userRoles)
    .values(
      seedUsers.map((u) => ({
        userId: uid(u.email),
        roleId: roleByName.get(u.role)!,
      })),
    )
    .onConflictDoNothing();
  await db
    .insert(teamMembers)
    .values(
      seedUsers.map((u) => ({ userId: uid(u.email), position: u.position, status: "ATIVO" as const })),
    )
    .onConflictDoNothing();

  // Cadastro pendente de demonstração (auto-cadastro aguardando aprovação)
  await db
    .insert(users)
    .values({
      name: "novo colaborador",
      email: "novo.colaborador@gmail.com",
      passwordHash: defaultHash,
      status: "PENDENTE",
      isActive: false,
      signupSource: "SELF_SIGNUP",
    })
    .onConflictDoNothing();

  const gabriela = uid("operacao@b2cgestao.com.br");
  const tiago = uid("trafego1@b2cgestao.com.br");
  const marina = uid("trafego2@b2cgestao.com.br");
  const sofia = uid("social@b2cgestao.com.br");
  const admin = uid("admin@b2cgestao.com.br");
  const owner = uid("owner@b2cgestao.com.br");

  // --- Clientes (nichos reais de agência local) --------------------------------
  const clientRows = await db
    .insert(clients)
    .values([
      {
        name: "Clínica Sorriso Prime", legalName: "Sorriso Prime Odontologia LTDA", brandName: "Sorriso Prime",
        agencyBrand: "B2C_GESTAO", businessModel: "NEGOCIO_LOCAL", niche: "Odontologia",
        city: "São Paulo", state: "SP", instagramUrl: "https://instagram.com/sorrisoprime",
        decisionMakerName: "Dra. Paula", decisionMakerPhone: "(11) 98888-1111",
        status: "ATIVO", healthStatus: "ESTAVEL", adsStatus: "ATIVO", pipelineStage: "BASE_DE_CLIENTES",
        strategistId: gabriela, trafficManager1Id: tiago, mainResponsibleId: tiago,
        startDate: new Date("2025-09-01"),
      },
      {
        name: "Moda Bella Store", brandName: "Moda Bella",
        agencyBrand: "LIFE_ADS", businessModel: "ECOMMERCE", niche: "Moda feminina",
        city: "Curitiba", state: "PR", instagramUrl: "https://instagram.com/modabella",
        decisionMakerName: "Renata Lima",
        status: "IMPLANTACAO", healthStatus: "OBSERVACAO", adsStatus: "PAUSADO", pipelineStage: "INTEGRACAO_META",
        strategistId: gabriela, trafficManager1Id: marina, mainResponsibleId: marina,
        startDate: new Date("2026-06-10"),
      },
      {
        name: "Academia Força Local",
        agencyBrand: "B2C_GESTAO", businessModel: "NEGOCIO_LOCAL", niche: "Fitness",
        city: "Belo Horizonte", state: "MG",
        decisionMakerName: "João Pedro",
        status: "EM_RISCO", healthStatus: "CRITICO", adsStatus: "ATIVO", pipelineStage: "CLIENTE_CRITICO",
        strategistId: gabriela, trafficManager1Id: tiago, trafficManager2Id: marina, mainResponsibleId: tiago,
        startDate: new Date("2025-03-15"),
        notes: "Cliente reclamou de CPL alto no último mês.",
      },
      {
        name: "Estética Vip Face",
        agencyBrand: "B2C_GESTAO", businessModel: "NEGOCIO_LOCAL", niche: "Estética",
        city: "Campinas", state: "SP",
        decisionMakerName: "Dra. Carol",
        status: "ONBOARDING", healthStatus: "ESTAVEL", adsStatus: "SEM_CAMPANHA", pipelineStage: "CRIACAO_DE_GRUPO",
        strategistId: gabriela, trafficManager1Id: marina, mainResponsibleId: marina,
        startDate: new Date("2026-07-01"),
      },
      {
        name: "Advocacia Martins & Rocha",
        agencyBrand: "B2C_GESTAO", businessModel: "NEGOCIO_LOCAL", niche: "Advocacia",
        city: "São Paulo", state: "SP",
        decisionMakerName: "Dr. Martins",
        status: "ATIVO", healthStatus: "OBSERVACAO", adsStatus: "ATIVO", pipelineStage: "EM_OBSERVACAO",
        strategistId: gabriela, trafficManager1Id: tiago, mainResponsibleId: tiago,
        startDate: new Date("2025-11-20"),
      },
      {
        name: "Pet Shop Amigo Fiel",
        agencyBrand: "LIFE_ADS", businessModel: "NEGOCIO_LOCAL", niche: "Pet",
        city: "Curitiba", state: "PR",
        status: "ATIVO", healthStatus: "ESTAVEL", adsStatus: "PAUSADO", pipelineStage: "BASE_DE_CLIENTES",
        strategistId: gabriela, trafficManager1Id: marina,
        startDate: new Date("2025-08-05"),
        notes: "Ads pausado a pedido do cliente durante reforma da loja.",
      },
      {
        name: "Restaurante Sabor & Cia",
        agencyBrand: "B2C_GESTAO", businessModel: "NEGOCIO_LOCAL", niche: "Alimentação",
        city: "São Paulo", state: "SP",
        status: "PERDIDO", healthStatus: "CRITICO", adsStatus: "SEM_CAMPANHA", pipelineStage: "CLIENTE_PERDIDO",
        churnDate: new Date("2026-05-20"), churnReason: "Corte de orçamento do cliente",
        startDate: new Date("2025-01-10"),
      },
      {
        name: "Imobiliária Horizonte",
        agencyBrand: "B2C_GESTAO", businessModel: "NEGOCIO_LOCAL", niche: "Imobiliário",
        city: "Santos", state: "SP",
        status: "LEAD", healthStatus: "ESTAVEL", adsStatus: "SEM_CAMPANHA", pipelineStage: "NOVO_CLIENTE",
        mainResponsibleId: uid("comercial@b2cgestao.com.br"),
      },
    ])
    .onConflictDoNothing()
    .returning();

  const byName = new Map(clientRows.map((c) => [c.name, c]));
  const sorriso = byName.get("Clínica Sorriso Prime")!;
  const modaBella = byName.get("Moda Bella Store")!;
  const academia = byName.get("Academia Força Local")!;
  const estetica = byName.get("Estética Vip Face")!;
  const advocacia = byName.get("Advocacia Martins & Rocha")!;

  // --- Perfis operacionais ------------------------------------------------------
  await db.insert(clientOperationalProfiles).values([
    {
      clientId: sorriso.id,
      platforms: ["Meta Ads", "Google Ads", "CRM"],
      averageDailyBudget: 150,
      campaignObjective: "Leads para avaliação odontológica",
      campaignTypes: ["Leads", "Remarketing"],
      offerDescription: "Avaliação gratuita + desconto em lentes",
      serviceRules: "Reunião mensal obrigatória. Reportar CPL semanalmente no grupo.",
      funnelNotes: "Anúncio → WhatsApp → agendamento → avaliação presencial",
      monthlyMeetingRequired: true,
      briefingText: "Clínica premium, foco em lentes de resina e implantes.",
    },
    {
      clientId: modaBella.id,
      platforms: ["Meta Ads", "Social Media"],
      averageDailyBudget: 80,
      campaignObjective: "Vendas no e-commerce",
      campaignTypes: ["Conversão", "Catálogo"],
      offerDescription: "Coleção inverno com 20% off na primeira compra",
      monthlyMeetingRequired: false,
    },
    {
      clientId: advocacia.id,
      platforms: ["Google Ads", "Google Meu Negócio"],
      averageDailyBudget: 60,
      campaignObjective: "Casos previdenciários",
      campaignTypes: ["Pesquisa"],
      monthlyMeetingRequired: true,
      briefingText: "Foco em BPC/LOAS e aposentadoria por invalidez.",
    },
  ]);

  // --- Saúde / histórico ---------------------------------------------------------
  await db.insert(clientHealthLogs).values([
    {
      clientId: academia.id, previousStatus: "OBSERVACAO", newStatus: "CRITICO",
      reason: "CPL subiu 60% e cliente ameaçou cancelar", changedById: gabriela,
    },
    {
      clientId: advocacia.id, previousStatus: "ESTAVEL", newStatus: "OBSERVACAO",
      reason: "Queda no volume de leads nas últimas 2 semanas", changedById: gabriela,
    },
  ]);

  // --- Reuniões -------------------------------------------------------------------
  await db.insert(clientMeetings).values([
    {
      clientId: sorriso.id, title: "Reunião mensal — Junho/2026",
      meetingDate: new Date("2026-06-15"),
      summary: "Cliente satisfeito. Alinhado aumento de verba para lentes.",
      createdById: gabriela,
    },
  ]);

  // --- Tarefas ---------------------------------------------------------------------
  const taskRows = await db
    .insert(tasks)
    .values([
      {
        title: "Checar campanhas Sorriso Prime", type: "DIARIA", status: "A_FAZER", priority: "ALTA",
        clientId: sorriso.id, assignedToId: tiago, createdById: gabriela, dueDate: new Date("2026-07-07"),
      },
      {
        title: "Relatório semanal Moda Bella", type: "SEMANAL", status: "EM_ANDAMENTO", priority: "MEDIA",
        clientId: modaBella.id, assignedToId: marina, createdById: gabriela, dueDate: new Date("2026-07-11"),
      },
      {
        title: "Plano de ação — Academia Força Local (conta crítica)", type: "OPERACIONAL", status: "A_FAZER",
        priority: "URGENTE", clientId: academia.id, assignedToId: tiago, createdById: gabriela,
        dueDate: new Date("2026-07-08"),
      },
      {
        title: "Organizar pauta social media da semana", type: "SOCIAL_MEDIA", status: "A_FAZER", priority: "MEDIA",
        assignedToId: sofia, createdById: gabriela, dueDate: new Date("2026-07-09"),
      },
      {
        title: "Auditar concorrentes da Estética Vip Face", type: "OPERACIONAL", status: "BACKLOG", priority: "BAIXA",
        clientId: estetica.id, createdById: gabriela,
      },
      {
        title: "Revisar extensões de anúncio Advocacia", type: "OPERACIONAL", status: "EM_ANDAMENTO", priority: "ALTA",
        clientId: advocacia.id, assignedToId: tiago, createdById: gabriela, dueDate: new Date("2026-07-03"),
      },
    ])
    .returning();

  // Checklist de exemplo na tarefa de plano de ação
  const planoTask = taskRows.find((t) => t.title.startsWith("Plano de ação"));
  if (planoTask) {
    const [cl] = await db
      .insert(taskChecklists)
      .values({ taskId: planoTask.id, title: "Plano de ação — conta crítica" })
      .returning();
    await db.insert(taskChecklistItems).values([
      { checklistId: cl.id, content: "Descrever problema", order: 0, isDone: true },
      { checklistId: cl.id, content: "Identificar causa provável", order: 1 },
      { checklistId: cl.id, content: "Definir plano de ação", order: 2 },
      { checklistId: cl.id, content: "Registrar retorno ao cliente", order: 3 },
    ]);
  }

  // --- Banco de Ativos Digitais ------------------------------------------------
  // secretId gerado antes para compor o AAD do GCM (vincula ciphertext ao registro)
  const sec = (v: string, assetId: string) => {
    const secretId = crypto.randomUUID();
    return {
      id: secretId,
      encryptedValue: encryptSecret(v, { secretId, assetId }),
    };
  };
  const groupRows = await db
    .insert(digitalAssetGroups)
    .values([
      { name: "Clínica Sorriso Prime", type: "CLIENTE", clientId: sorriso.id, createdById: admin },
      { name: "Advocacia Martins & Rocha", type: "CLIENTE", clientId: advocacia.id, createdById: admin },
      { name: "B2C Gestão", type: "INTERNO", description: "Contas internas da agência", createdById: admin },
      { name: "Contas do TikTok", type: "PLATAFORMA", description: "Pool de contas TikTok da operação", createdById: admin },
      { name: "Dolphin Anty", type: "PLATAFORMA", description: "Perfis de navegador da operação", createdById: admin },
    ])
    .returning();
  const groupByName = new Map(groupRows.map((g) => [g.name, g]));
  const gSorriso = groupByName.get("Clínica Sorriso Prime")!;
  const gAdv = groupByName.get("Advocacia Martins & Rocha")!;
  const gInterno = groupByName.get("B2C Gestão")!;
  const gTikTok = groupByName.get("Contas do TikTok")!;
  const gDolphin = groupByName.get("Dolphin Anty")!;

  const assetRows = await db
    .insert(digitalAssets)
    .values([
      {
        groupId: gSorriso.id, clientId: sorriso.id, title: "BM Principal — Sorriso Prime",
        assetType: "META_BUSINESS_MANAGER", platform: "META", status: "ATIVA", priority: "ALTA",
        loginUrl: "https://business.facebook.com", businessManagerId: "1234567890",
        assignedToId: tiago, ownerUserId: gabriela, createdById: admin,
        lastCheckedAt: new Date("2026-06-25"), nextReviewAt: new Date("2026-07-25"),
        tags: ["principal", "verificada"],
      },
      {
        groupId: gSorriso.id, clientId: sorriso.id, title: "Instagram @sorrisoprime",
        assetType: "INSTAGRAM_ACCOUNT", platform: "INSTAGRAM", status: "ATIVA",
        profileUrl: "https://instagram.com/sorrisoprime", assignedToId: sofia, createdById: admin,
      },
      {
        groupId: gAdv.id, clientId: advocacia.id, title: "Google Ads — Martins & Rocha",
        assetType: "GOOGLE_ADS", platform: "GOOGLE", status: "ATIVA",
        loginUrl: "https://ads.google.com", adAccountId: "735-201-8899",
        assignedToId: tiago, createdById: admin,
        lastCheckedAt: new Date("2026-06-15"), nextReviewAt: new Date("2026-07-01"),
      },
      {
        groupId: gTikTok.id, title: "Conta TikTok 04",
        assetType: "TIKTOK_ACCOUNT", platform: "TIKTOK", status: "BLOQUEADA", priority: "CRITICA",
        notes: "Caiu na verificação — precisa de selfie do titular.",
        assignedToId: marina, createdById: admin,
      },
      {
        groupId: gTikTok.id, title: "Conta TikTok 05",
        assetType: "TIKTOK_ACCOUNT", platform: "TIKTOK", status: "SENDO_ESQUENTADA",
        assignedToId: marina, createdById: admin, nextReviewAt: new Date("2026-07-12"),
      },
      {
        groupId: gDolphin.id, title: "Perfil Dolphin 12",
        assetType: "ANTIDETECT_PROFILE", platform: "DOLPHIN_ANTY", status: "PRONTA_PARA_USO",
        profileId: "DLP-012", loginUrl: "https://app.dolphin-anty.com",
        assignedToId: tiago, createdById: admin,
      },
      {
        groupId: gInterno.id, title: "Gmail interno — relatórios",
        assetType: "EMAIL_ACCOUNT", platform: "GOOGLE", status: "ATIVA",
        createdById: admin,
      },
    ])
    .returning();
  const assetByTitle = new Map(assetRows.map((a) => [a.title, a]));

  const aBm = assetByTitle.get("BM Principal — Sorriso Prime")!.id;
  const aInsta = assetByTitle.get("Instagram @sorrisoprime")!.id;
  const aGads = assetByTitle.get("Google Ads — Martins & Rocha")!.id;
  const aGmail = assetByTitle.get("Gmail interno — relatórios")!.id;
  await db.insert(digitalAssetSecrets).values([
    {
      assetId: aBm,
      secretType: "USERNAME", label: "Login principal", createdById: admin,
      ...sec("ads@sorrisoprime.com.br", aBm),
    },
    {
      assetId: aBm,
      secretType: "PASSWORD", label: "Senha do BM", createdById: admin,
      ...sec("senha-exemplo-sorriso", aBm),
    },
    {
      assetId: aInsta,
      secretType: "PASSWORD", label: "Senha do Instagram", createdById: admin,
      ...sec("senha-exemplo-insta", aInsta),
    },
    {
      assetId: aGads,
      secretType: "EMAIL", label: "E-mail de acesso", createdById: admin,
      ...sec("trafego@martinsrocha.adv.br", aGads),
    },
    {
      assetId: aGads,
      secretType: "PASSWORD", label: "Senha do Google Ads", createdById: admin,
      ...sec("senha-exemplo-advocacia", aGads),
    },
    {
      assetId: aGmail,
      secretType: "API_KEY", label: "API Key relatórios", createdById: admin,
      ...sec("chave-api-exemplo-000", aGmail),
    },
  ]);

  await db.insert(digitalAssetComments).values([
    {
      assetId: assetByTitle.get("Conta TikTok 04")!.id,
      authorId: tiago, type: "ANALISE",
      content: "Análise solicitada dia 10/05, aguardando retorno do suporte.",
    },
    {
      assetId: assetByTitle.get("Conta TikTok 04")!.id,
      authorId: marina, type: "ALERTA",
      content: "Suporte pediu documento do titular. Cliente avisado.",
    },
  ]);

  // --- Documentos ----------------------------------------------------------------------
  await db.insert(documents).values([
    {
      title: "Playbook de onboarding de cliente", type: "PLAYBOOK", category: "processo",
      content: "## Passos do onboarding\n1. Criar grupo\n2. Solicitar acessos\n3. Briefing...",
      createdById: gabriela,
    },
    {
      title: "Briefing estratégico — Sorriso Prime", type: "BRIEFING", clientId: sorriso.id,
      content: "Público: 30-55 anos, classe AB. Oferta principal: lentes de resina.",
      createdById: gabriela,
    },
  ]);

  // --- Metas ----------------------------------------------------------------------------
  await db.insert(goals).values([
    {
      title: "Contas recuperadas no mês", category: "OPERACIONAL", scope: "AGENCIA", status: "EM_EXECUCAO",
      targetValue: 3, superTargetValue: 5, currentValue: 1, unit: "contas",
      ownerId: owner, periodStart: new Date("2026-07-01"), periodEnd: new Date("2026-07-31"),
    },
    {
      title: "Novos clientes no trimestre", category: "CLIENTES", scope: "AGENCIA", status: "EM_EXECUCAO",
      targetValue: 9, superTargetValue: 12, currentValue: 3, unit: "clientes",
      ownerId: uid("comercial@b2cgestao.com.br"),
      periodStart: new Date("2026-07-01"), periodEnd: new Date("2026-09-30"),
    },
    {
      title: "Churn máximo do mês", category: "CHURN", scope: "AGENCIA", status: "PLANEJADA",
      targetValue: 2, currentValue: 0, unit: "clientes", ownerId: gabriela,
      periodStart: new Date("2026-07-01"), periodEnd: new Date("2026-07-31"),
    },
  ]);

  // --- Templates operacionais (Prompt 9) ---------------------------------------------------
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
        createdById: gabriela,
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
        createdById: gabriela,
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
        createdById: gabriela,
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
        createdById: gabriela,
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
        createdById: gabriela,
      },
      {
        name: "Reunião Mensal", slug: "reuniao-mensal", taskType: "OPERACIONAL",
        pipelineStage: "BASE_DE_CLIENTES",
        description: "Checklist anual de reuniões mensais de acompanhamento",
        items: t([
          "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
          "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
        ]),
        createdById: gabriela,
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
        createdById: gabriela,
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
        createdById: gabriela,
      },
      {
        name: "Cliente Oculto", slug: "cliente-oculto", taskType: "CLIENTE_OCULTO",
        items: t([
          { title: "Definir roteiro de contato", dueOffsetDays: 1, role: "GESTOR" },
          { title: "Executar contato como cliente oculto", dueOffsetDays: 3, role: "GESTOR" },
          { title: "Registrar tempo de resposta e abordagem", dueOffsetDays: 3, role: "GESTOR" },
          { title: "Enviar relatório ao cliente", dueOffsetDays: 5, role: "ESTRATEGISTA" },
        ]),
        createdById: gabriela,
      },
      {
        name: "CRM/IA", slug: "crm-ia", taskType: "CRM",
        items: t([
          { title: "Mapear funil de atendimento", dueOffsetDays: 2, role: "ESTRATEGISTA" },
          { title: "Configurar automações de CRM", dueOffsetDays: 4, role: "GESTOR" },
          { title: "Treinar respostas da IA", dueOffsetDays: 5, role: "GESTOR" },
          { title: "Validar com o cliente", dueOffsetDays: 7, role: "GESTOR" },
        ]),
        createdById: gabriela,
      },
      {
        name: "Solicitação de Criativo", slug: "solicitacao-criativo", taskType: "CRIATIVO",
        items: t([
          { title: "Escrever copy", dueOffsetDays: 2, role: "SOCIAL_MEDIA" },
          { title: "Produzir design/edição", dueOffsetDays: 4, role: "DESIGNER" },
          { title: "Enviar para aprovação", dueOffsetDays: 5, role: "GESTOR" },
        ]),
        createdById: gabriela,
      },
    ])
    .onConflictDoNothing();

  // --- Automações seedadas (Prompt 15) -----------------------------------------------------
  await db
    .insert(automationRules)
    .values([
      {
        name: "Cliente criado → aplicar onboarding",
        triggerType: "CLIENT_CREATED",
        actions: [{ type: "APPLY_TEMPLATE", params: { templateSlug: "onboarding-cliente" } }],
        scope: "GLOBAL", createdById: owner,
      },
      {
        name: "Movido p/ Integração Meta → tarefas de integração",
        triggerType: "CLIENT_STAGE_CHANGED",
        conditions: { toStage: "INTEGRACAO_META" },
        actions: [{ type: "APPLY_TEMPLATE", params: { templateSlug: "integracao-meta" } }],
        scope: "OPERACIONAL", createdById: owner,
      },
      {
        name: "Movido p/ Integração Google → tarefas de integração",
        triggerType: "CLIENT_STAGE_CHANGED",
        conditions: { toStage: "INTEGRACAO_GOOGLE" },
        actions: [{ type: "APPLY_TEMPLATE", params: { templateSlug: "integracao-google" } }],
        scope: "OPERACIONAL", createdById: owner,
      },
      {
        name: "Movido p/ Base de Clientes → checklist de reunião mensal",
        triggerType: "CLIENT_STAGE_CHANGED",
        conditions: { toStage: "BASE_DE_CLIENTES" },
        actions: [{ type: "APPLY_TEMPLATE", params: { templateSlug: "reuniao-mensal", asChecklist: true } }],
        scope: "OPERACIONAL", createdById: owner,
      },
      {
        name: "Cliente crítico → tarefa de plano de ação",
        triggerType: "CLIENT_HEALTH_CHANGED",
        conditions: { toHealth: "CRITICO" },
        actions: [
          { type: "APPLY_TEMPLATE", params: { templateSlug: "cliente-critico" } },
          { type: "SEND_NOTIFICATION", params: { toRole: "GESTOR_OPERACIONAL", title: "Cliente crítico", type: "ALERTA" } },
        ],
        scope: "GLOBAL", createdById: owner,
      },
      {
        name: "Cliente perdido → encerrar campanhas e revisar ativos",
        triggerType: "CLIENT_MARKED_LOST",
        actions: [
          { type: "UPDATE_CLIENT_FIELD", params: { field: "adsStatus", value: "SEM_CAMPANHA" } },
          { type: "SEND_NOTIFICATION", params: { toRole: "GESTOR_OPERACIONAL", title: "Cliente perdido — revisar ativos digitais e remover acessos", type: "ALERTA" } },
          { type: "CREATE_ACTIVITY_LOG", params: { action: "client.assetsReviewNeeded" } },
        ],
        scope: "GLOBAL", createdById: owner,
      },
      {
        name: "Tarefa vencida → notificar responsável",
        triggerType: "TASK_OVERDUE",
        actions: [{ type: "SEND_NOTIFICATION", params: { toAssignee: true, title: "Tarefa vencida", type: "TAREFA" } }],
        scope: "GLOBAL", createdById: owner,
      },
      {
        name: "Tarefa sem responsável → alertar gestor operacional",
        triggerType: "TASK_CREATED",
        conditions: { withoutAssignee: true },
        actions: [{ type: "SEND_NOTIFICATION", params: { toRole: "GESTOR_OPERACIONAL", title: "Tarefa criada sem responsável", type: "ALERTA" } }],
        scope: "OPERACIONAL", createdById: owner,
      },
      {
        name: "Ativo bloqueado → alerta operacional",
        triggerType: "ASSET_STATUS_CHANGED",
        conditions: { toStatus: "BLOQUEADA" },
        actions: [{ type: "SEND_NOTIFICATION", params: { toRole: "GESTOR_OPERACIONAL", title: "Ativo digital bloqueado", type: "ALERTA" } }],
        scope: "GLOBAL", createdById: owner,
      },
      {
        name: "Formulário de reunião mensal → salvar no histórico",
        triggerType: "FORM_SUBMITTED",
        conditions: { formSlug: "reuniao-mensal" },
        actions: [{ type: "ADD_COMMENT", params: { toClientHistory: true } }],
        scope: "GLOBAL", createdById: owner,
      },
    ])
    .onConflictDoNothing();

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

  console.log("✅ Seed v3 concluído.");
  console.log("   Login de teste: owner@b2cgestao.com.br / cop123456 (todos os usuários usam cop123456)");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Seed falhou:", err);
    process.exit(1);
  });
