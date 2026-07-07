# Auditoria Inicial do Repositório — COP B2C

Data: 2026-07-06

## 1. Stack identificada

**Não existe stack no repositório.** O repositório contém apenas:

- `README.md` descrevendo a intenção da estrutura.
- Diretórios **vazios**: `apps/web`, `apps/api`, `packages/shared`, `config`, `docs`, `data/sql`, `tests/unit`, `tests/e2e`, `infrastructure/docker`, `infrastructure/k8s`, `.github/workflows`.

Não há `package.json`, código-fonte, migrations, dependências ou configuração. Não há nada para rodar, buildar, lintar ou testar. Ou seja: o COP B2C começa do zero, com liberdade total de escolha de stack.

## 2. Problemas encontrados

| # | Problema | Gravidade | Ação |
|---|----------|-----------|------|
| 1 | O repositório git está inicializado em `/Users/macbook` (a pasta HOME do usuário), não na pasta do projeto. Todo o conteúdo da home aparece como untracked. | Alta | Foi criado um `git init` próprio em `Desktop/cop`. **Recomendado remover `/Users/macbook/.git` manualmente** (não removido automaticamente por segurança). |
| 2 | Estrutura de monorepo (apps/web + apps/api + k8s) sugere complexidade que a fase atual não justifica. | Média | MVP como app Next.js full-stack único em `apps/web`. `apps/api` separado só se/quando necessário (Fase 3). |
| 3 | Ambiente local sem Docker e sem PostgreSQL instalados. | Média | Desenvolvimento local com SQLite; schema desenhado para portar para Postgres em produção. |
| 4 | Arquivos `.DS_Store` espalhados. | Baixa | Adicionados ao `.gitignore`. |

## 3. Riscos técnicos

1. **SQLite não tem enums nativos** — enums são garantidos na camada TypeScript (Drizzle `text({ enum })`) + validação Zod. Ao migrar para Postgres, converter para enums nativos.
2. **Criptografia do Cofre depende de `VAULT_ENCRYPTION_KEY`** em `.env` — a chave nunca pode ir para o git; perda da chave = perda das senhas do cofre.
3. **Migração do ClickUp** exigirá limpeza manual antes (clientes misturados com tarefas na mesma lista).
4. **Sem CI ainda** — `.github/workflows` vazio; adicionar pipeline de lint/build/test na Fase 1.

## 4. Stack escolhida (decisão)

| Camada | Escolha | Justificativa |
|--------|---------|---------------|
| Framework | **Next.js 15 (App Router) + React 19 + TypeScript** | Full-stack em um só app: telas + server actions + API. Rápido para uma equipe pequena. |
| Estilo | **Tailwind CSS 4** | Velocidade de UI, consistência, dark-mode fácil. |
| Banco (dev) | **SQLite** (better-sqlite3) | Zero infraestrutura local (sem Docker/Postgres na máquina). |
| Banco (prod) | PostgreSQL (futuro) | Schema já modelado com portabilidade em mente. |
| ORM | **Drizzle ORM + drizzle-kit** | Types derivados direto do schema; migrations SQL versionadas; troca SQLite→Postgres viável. |
| Validação | **Zod** | Fonte única de validação compartilhada entre server actions e UI. |
| Auth | **Sessão própria: cookie httpOnly + JWT assinado (jose) + bcryptjs** | Controle total de papéis/permissões sem dependência externa. |
| Criptografia do cofre | **AES-256-GCM** (node:crypto) | Padrão de mercado, autenticado, chave via env. |
| Testes | **Vitest** | Unit tests rápidos para permissões, crypto e auth. |

## 5. Como rodar o projeto

```bash
cd apps/web
npm install
cp .env.example .env    # gerar chaves reais (instruções no arquivo)
npm run db:push         # cria o banco SQLite a partir do schema
npm run db:seed         # usuários, papéis, permissões e clientes fictícios
npm run dev             # http://localhost:3000
```

Comandos disponíveis: `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `db:push`, `db:generate`, `db:migrate`, `db:seed`, `db:studio`.

## 6. Plano de desenvolvimento por fases

### Fase 0 — Fundação técnica
- git correto no diretório do projeto; `.gitignore`.
- App Next.js + TypeScript + Tailwind em `apps/web`.
- Drizzle + SQLite; schema completo das entidades do MVP; seed.
- Autenticação (login/logout), papéis, permissões, middleware de proteção.
- Criptografia AES-256-GCM para o Cofre.
- Layout base (shell com navegação por módulo) + tela de Equipe.
- Lint, typecheck, testes unitários.

### Fase 1 — MVP operacional
- Clientes: listagem com filtros (gestor, estrategista, nicho, status, saúde, plano), CRUD, detalhe do cliente (abas: visão geral, perfil operacional, tarefas, saúde, financeiro-resumo, cofre).
- Operação/Kanban: pipeline de ciclo de vida do cliente (onboarding→implantação→ativo) separado do Kanban de tarefas.
- Tarefas: CRUD, tipos (diária/semanal/operacional/etc.), checklist, comentários, atribuição.
- Cofre de Acessos: metadata visível conforme papel, revelar segredo com permissão + log.
- Financeiro básico: contas a receber, status de cobrança, inadimplência.
- Dashboard geral simples (contadores + saúde da carteira).

### Fase 2 — Automações, financeiro avançado, formulários e relatórios
- Motor de automações (gatilho→condição→ação) + log de execução.
- Contas a pagar, recorrência, risco de inadimplência, exportações.
- Formulários internos: onboarding, briefing, solicitação de criativos, reunião mensal, registro de problemas.
- Criativos: fila de solicitações com pipeline próprio.
- Relatórios operacionais e financeiros; Metas com targets.
- Notificações in-app.

### Fase 3 — IA, integrações, dashboards avançados e portal do cliente
- Integrações Meta Ads / Google Ads (métricas de campanha).
- Dashboards avançados por cliente e por gestor.
- IA: resumo de saúde da conta, sugestão de tarefas, alertas.
- Portal do cliente (papel CLIENTE_CONVIDADO).
- Migração para PostgreSQL + deploy (Docker/K8s já previstos em `infrastructure/`).

## 7. Primeiros arquivos e ordem de execução

1. `apps/web` (scaffold Next.js) → 2. `src/db/schema.ts` → 3. `drizzle.config.ts` + `.env.example` → 4. `src/db/seed.ts` → 5. `src/lib/crypto.ts` → 6. `src/lib/auth/*` (sessão, senha, permissões) → 7. `src/middleware.ts` → 8. telas: `/login`, shell, `/equipe`, `/acesso-negado` → 9. testes → 10. CI.
