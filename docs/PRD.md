# PRD Técnico — COP B2C

Central Operacional Própria da B2C Gestão. Versão 1.0 — 2026-07-06.

## 1. Visão geral do produto

O COP B2C é o sistema operacional interno da agência B2C Gestão (e da marca Life Ads). Substitui o ClickUp como fonte única de verdade para: carteira de clientes, operação de tráfego pago, social media, CRM/IA, criativos, financeiro, metas, credenciais e documentação. É um sistema web multiusuário com papéis e permissões, pensado para o uso diário da equipe.

## 2. Objetivo principal

Transformar a operação atual (uma lista única no ClickUp que mistura tudo) em módulos separados, com dados estruturados, automações nativas e segurança real para credenciais — mais rápido e mais simples que o ClickUp para a rotina da agência.

## 3. Problemas atuais do ClickUp que o COP B2C resolve

1. **Tudo misturado na lista TRÁFEGO PAGO**: clientes, tarefas diárias, semanais, social media, CRM, cliente oculto e clientes perdidos convivem como "tarefas" na mesma lista.
2. **Cliente é representado como tarefa** — status de cliente (ex.: INTEGRAÇÃO META) e status de tarefa (ex.: TAREFA DIÁRIA) vivem no mesmo campo.
3. **Credenciais em texto puro** dentro de Docs (Banco de Dados/Contas e Perfis) — risco grave de segurança.
4. **Zero automações** — cobranças, alertas de saúde, tarefas recorrentes: tudo manual.
5. **Zero formulários** — onboarding e briefing sem padronização.
6. **Financeiro descolado da operação** — inadimplência não aparece para quem atende o cliente.
7. **Sem histórico estruturado** — mudanças de saúde da conta e churn não geram registro auditável.

## 4. O que NÃO deve ser copiado do ClickUp

- Lista única com status que mistura pipeline de cliente e tipo de tarefa.
- Campos livres de texto para dados que devem ser estruturados (plano, saúde, nicho).
- Docs como repositório de senhas.
- Hierarquia genérica Espaço→Pasta→Lista→Tarefa — o COP tem módulos com semântica própria.
- Flexibilidade infinita de campos custom — o COP tem schema fixo e validado.

## 5. Módulos do sistema

| Módulo | Fase | Descrição resumida |
|---|---|---|
| Dashboard geral | 1 | Visão da carteira: clientes por status/saúde, tarefas do dia, inadimplência, alertas |
| Clientes | 1 | Carteira com filtros por gestor, estrategista, nicho, empresa, status, saúde, plano |
| Detalhe do cliente | 1 | Ficha 360°: perfil operacional, tarefas, histórico de saúde, resumo financeiro, cofre |
| Operação/Kanban | 1 | Kanban do ciclo de vida do cliente + Kanban de tarefas (separados) |
| Tarefas | 1 | Tarefas por tipo, checklist, comentários, dependências, tempo |
| Cofre de Acessos | 1 | Credenciais criptografadas, permissão por papel, log de revelação |
| Equipe/Pessoas | 0 | Colaboradores, papéis, ativação/desativação |
| Financeiro | 1–2 | A receber (MVP), a pagar, planos, inadimplência, recorrência, exportação |
| Criativos | 2 | Fila de solicitações com pipeline próprio (briefing→produção→aprovação→entregue) |
| Social Media | 2 | Tarefas e calendário de social media por cliente |
| Metas | 2 | Metas da agência e por gestor, com targets mensuráveis |
| Documentos/Wiki | 2 | Documentos comuns por cliente/área (NUNCA credenciais) |
| Formulários | 2 | Onboarding, briefing, criativos, reunião mensal, registro de problemas |
| Automações | 2 | Regras gatilho→condição→ação com log de execução |
| Relatórios | 2 | Operacionais e financeiros, com filtros e exportação |
| Configurações/Permissões | 0–1 | Papéis, permissões, parâmetros do sistema |
| Portal do cliente | 3 | Visão limitada para CLIENTE_CONVIDADO |
| IA e integrações | 3 | Meta/Google Ads, resumos de conta por IA, alertas inteligentes |

## 6. Funcionalidades por módulo (essencial)

### Clientes
- CRUD completo; separação total de tarefas.
- Filtros combináveis: gestor 1/2, estrategista, responsável, nicho, modelo de negócio, empresa (B2C_GESTAO/LIFE_ADS), status, saúde, status de ads, plano, vencimento, inadimplência.
- Mover status pelo pipeline (permissão `clients.moveStatus`), com registro em ActivityLog.
- Saúde da conta (ESTAVEL/OBSERVACAO/CRITICO) editável com motivo → gera ClientHealthLog.
- Churn: marcar PERDIDO exige data + motivo.

### Detalhe do cliente
- Abas: Visão geral · Perfil operacional · Tarefas · Saúde (timeline) · Financeiro (resumo, se permissão) · Cofre (se permissão) · Documentos · Contatos.

### Operação/Kanban
- **Kanban de ciclo de vida do cliente**: LEAD → ONBOARDING → IMPLANTACAO → ATIVO → EM_RISCO/PAUSADO → PERDIDO. Etapas de implantação (criação de grupo, integração Meta, integração Google, pesquisa de mercado, diagnóstico estratégico, estudo de funil, integração social media) viram **ClientPipelineStage/checklist de implantação**, não status.
- **Kanban de tarefas**: A_FAZER → EM_ANDAMENTO → EM_REVISAO → CONCLUIDA (+ BLOQUEADA, CANCELADA).

### Tarefas
- Tipos: OPERACIONAL, DIARIA, SEMANAL, SOCIAL_MEDIA, CRIATIVO, FINANCEIRA, PROJETO, CLIENTE_OCULTO, CRM.
- Vínculo opcional a cliente e/ou projeto; sempre têm responsável.
- Checklist, comentários, anexos, dependências, registro de tempo.
- Recorrência (diária/semanal) gerada por automação na Fase 2.

### Financeiro
- A receber: valor, vencimento, status de cobrança (NAO_COBRADO, COBRANCA_ENVIADA, PAGO, ATRASADO, CANCELADO), inadimplência (EM_DIA, DEVENDO, RISCO), plano (MENSAL, PRO_CARTAO, PRO_AV, OUTRO), recorrência, empresa.
- A pagar: fornecedor, categoria, vencimento, status.
- Relaciona-se ao cliente por FK, mas vive em módulo próprio com permissão própria.

### Cofre de Acessos
- Item = sistema, URL, usuário, senha criptografada (AES-256-GCM), nível de acesso, papéis com visibilidade.
- Dois níveis de leitura: `vault.viewMetadata` (vê que existe) e `vault.revealSecret` (descriptografa). Toda revelação gera ActivityLog.

### Automações (Fase 2) — regras desejadas
1. A receber vence e não pago → marca ATRASADO + notifica FINANCEIRO.
2. 2 cobranças ATRASADO → cliente vira EM_RISCO + delinquency RISCO.
3. Saúde muda para CRITICO → notifica estrategista + gestor operacional e cria tarefa de plano de ação.
4. Cliente entra em ONBOARDING → cria checklist de implantação padrão.
5. Tarefas DIARIA/SEMANAL → recriação automática por recorrência.
6. Tarefa vencida há 24h → notifica responsável e gestor.
7. Solicitação de criativo aprovada → tarefa para DESIGNER.
8. Cliente marcado PERDIDO → exige motivo, arquiva tarefas abertas, notifica financeiro.

### Formulários (Fase 2)
Onboarding de cliente · Briefing de campanha · Solicitação de criativos · Ata de reunião mensal · Registro de problemas. Cada submissão pode criar/atualizar entidades (ex.: onboarding preenche ClientOperationalProfile).

## 7. Entidades principais e relações

```
User ⇄ Role (N:N via user_roles) ⇄ Permission (N:N via role_permissions)
User 1–1 TeamMember (dados de RH/contato)
Client 1–N ClientContact | 1–1 ClientOperationalProfile | 1–N ClientHealthLog | 1–N ClientPipelineStage
Client 1–N Task | 1–N CreativeRequest | 1–N FinancialAccountReceivable | 1–N CredentialVaultItem | 1–N Document
Client N–1 User (strategist, trafficManager1, trafficManager2, mainResponsible)
Task 1–N TaskComment/TaskChecklist/TaskAttachment/TaskTimeEntry; TaskChecklist 1–N TaskChecklistItem
Task N–N Task (TaskDependency)
FinancialPlan 1–N FinancialAccountReceivable
Goal 1–N GoalTarget
AutomationRule 1–N AutomationExecutionLog
FormTemplate 1–N FormSubmission
ActivityLog e Notification referenciam User + entidade polimórfica (entityType/entityId)
```

## 8. Regras de negócio

1. **Cliente não é tarefa.** Entidades distintas, telas distintas, status distintos.
2. Status do cliente ≠ saúde da conta ≠ status de ads — três campos independentes.
3. Financeiro relaciona com cliente por FK, mas nunca aparece na ficha operacional sem permissão `finance.view`.
4. Credencial nunca em texto puro; revelação sempre logada.
5. Marcar PERDIDO exige churnDate + churnReason.
6. Tarefa concluída registra completedAt e quem concluiu.
7. Usuário desativado não loga e sai de listas de atribuição, mas o histórico permanece.
8. Toda alteração sensível (status, saúde, financeiro, cofre, permissão) gera ActivityLog.

## 9. Status e pipelines

- **Client.status**: LEAD, ONBOARDING, IMPLANTACAO, ATIVO, EM_RISCO, PAUSADO, PERDIDO.
- **Client.healthStatus**: ESTAVEL, OBSERVACAO, CRITICO.
- **Client.adsStatus**: ATIVO, PAUSADO, SEM_CAMPANHA.
- **Task.status**: A_FAZER, EM_ANDAMENTO, EM_REVISAO, BLOQUEADA, CONCLUIDA, CANCELADA.
- **Task.priority**: BAIXA, MEDIA, ALTA, URGENTE.
- **CreativeRequest.status**: SOLICITADO, EM_PRODUCAO, EM_APROVACAO, AJUSTES, ENTREGUE, CANCELADO.
- **Receivable.billingStatus / delinquencyStatus / plan**: conforme §6 Financeiro.
- **ClientPipelineStage.status**: PENDENTE, EM_ANDAMENTO, CONCLUIDA, NAO_APLICAVEL.

## 10. Permissões e papéis

Papéis: OWNER, ADMIN, GESTOR_OPERACIONAL, GESTOR_TRAFEGO, SOCIAL_MEDIA, DESIGNER, FINANCEIRO, COMERCIAL, CLIENTE_CONVIDADO.

Permissões (módulo.ação): clients.{view,create,update,delete,moveStatus} · tasks.{view,create,update,delete,assign,complete} · finance.{view,create,update,delete,export} · vault.{viewMetadata,revealSecret,create,update,delete} · team.{view,create,update,deactivate} · goals.{view,create,update,delete} · automations.{view,create,update,delete} · settings.{view,update}.

Matriz completa no seed (`src/db/seed.ts`) — OWNER/ADMIN tudo (ADMIN sem settings.update); GESTOR_OPERACIONAL sem financeiro/cofre-secreto; FINANCEIRO só finanças + clients.view; etc.

## 11. Telas

**MVP (Fases 0–1):** Login · Shell/navegação · Dashboard · Clientes (lista+filtros) · Detalhe do cliente · Kanban ciclo de vida · Kanban/lista de tarefas · Detalhe de tarefa · Cofre (lista+item+revelar) · Financeiro a receber · Equipe · Acesso negado / vazio / erro.

**Fase 2:** Criativos (fila) · Social Media (calendário) · Formulários (builder simples + submissões) · Automações (lista de regras + log) · Relatórios · Metas · Documentos/Wiki · Contas a pagar.

**Fase 3:** Portal do cliente · Dashboards de mídia (Meta/Google) · Painéis de IA · Configurações avançadas de integração.

## 12. Migração do ClickUp

**Migrar:** clientes (linhas da lista TRÁFEGO PAGO que são clientes) com EMPRESA→agencyBrand, ESTRATEGISTA/GESTOR 1/GESTOR 2/RESPONSÁVEL 1→FKs de usuário, MODELO DE NEGÓCIO→businessModel, NICHO→niche, STATUS DE SAÚDE→healthStatus, OBSERVAÇÃO→notes, PRAZO→dueDate de tarefas; pessoas; docs de estratégia→Document; credenciais→Cofre (recriptografando); financeiro→Receivable/Payable.

**Reorganizar ANTES de migrar:** separar o que é cliente do que é tarefa na lista TRÁFEGO PAGO; converter status de implantação em etapas de pipeline; unificar nomenclatura de nicho e plano; identificar clientes PERDIDOS com data/motivo; apagar credenciais dos Docs após importação no cofre.

## 13. Critérios de aceite do MVP

1. Login/logout funcionais; rota protegida redireciona para /login.
2. Usuário sem permissão vê tela "Acesso negado" amigável (nunca erro 500).
3. CRUD de clientes com todos os filtros do §6 funcionando.
4. Cliente e tarefa são entidades/telas separadas; pipelines separados.
5. Cofre: senha nunca aparece em resposta de API sem `vault.revealSecret`; revelação gera log.
6. Financeiro invisível para papéis sem `finance.view`.
7. Equipe: cadastrar, editar, ativar/desativar colaborador com papéis.
8. ActivityLog registra: mudança de status/saúde de cliente, revelação de segredo, mudanças de papel.
9. Seed permite demonstrar o sistema de ponta a ponta.
10. `lint`, `typecheck`, `build` e `test` passam.

## 14. Ordem de implementação recomendada (etapas pequenas)

1. Fundação: scaffold, git, env, gitignore. ✅
2. Schema Drizzle completo + push + seed. ✅ (Prompt 3)
3. Crypto (AES-256-GCM) + hash de senha. ✅ (Prompt 3/4)
4. Sessão JWT + login/logout + middleware. ✅ (Prompt 4)
5. Guard de permissões + ActivityLog. ✅ (Prompt 4)
6. Shell de navegação + tela Equipe + Acesso negado. ✅ (Prompt 4)
7. Clientes: lista + filtros + CRUD + detalhe. (Próximo)
8. Kanban ciclo de vida + etapas de implantação.
9. Tarefas: lista/kanban + detalhe + checklist + comentários.
10. Cofre de acessos (UI + revelação logada).
11. Financeiro a receber + dashboard.
12. Fase 2: automações → formulários → criativos → relatórios → metas.
