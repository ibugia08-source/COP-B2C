# COP B2C

Central Operacional da B2C Gestão — substituto próprio do ClickUp para a rotina da agência (tráfego pago, social media, CRM/IA e comercial).

## Documentação

- [docs/AUDITORIA.md](docs/AUDITORIA.md) — auditoria inicial, stack escolhida e plano por fases
- [docs/PRD.md](docs/PRD.md) — PRD técnico completo (módulos, entidades, regras, permissões, migração)

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Drizzle ORM · Postgres (Neon serverless) · Zod · jose (JWT) · bcryptjs · Vitest

## Como rodar

```bash
cd apps/web
npm install
cp .env.example .env   # gere AUTH_SECRET (openssl rand -base64 48) e VAULT_ENCRYPTION_KEY (openssl rand -hex 32)
npm run db:push        # cria o banco a partir do schema
npm run db:seed        # papéis, permissões, usuários e clientes fictícios
npm run dev            # http://localhost:3000
```

Login de desenvolvimento: `owner@b2cgestao.com.br` / `cop123456` (todos os usuários do seed usam a mesma senha).

## Comandos

| Comando | Descrição |
|---|---|
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` / `npm start` | build e servidor de produção |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript sem emitir |
| `npm run test` | testes unitários (Vitest) |
| `npm run db:push` | aplica o schema no banco |
| `npm run db:generate` | gera migration SQL versionada |
| `npm run db:seed` | popula dados iniciais |
| `npm run db:studio` | UI do banco (Drizzle Studio) |

## Módulos implementados

Dashboard executivo · Clientes (ficha 360°) · Operação (Kanban do ciclo de vida) · Tarefas (lista/kanban/calendário, subtarefas, checklists) · Templates operacionais · Criativos + Social Media · Equipe e papéis · Metas · Banco de Ativos Digitais (contas, perfis e credenciais com AES-256-GCM e auditoria) · Documentos/Wiki · Formulários · Automações (motor gatilho→condição→ação) · Importação do ClickUp e do Trello ([docs/IMPORTACAO.md](docs/IMPORTACAO.md)).

## Estrutura

- `apps/web` — aplicação full-stack (telas + server actions + banco)
- `apps/web/src/db` — schema Drizzle (30 entidades), seed e client
- `apps/web/src/lib/auth` — sessão JWT, senha, matriz de permissões e guards
- `apps/web/src/lib/crypto.ts` — AES-256-GCM do Banco de Ativos Digitais
- `docs` — auditoria e PRD
- `packages/shared`, `apps/api`, `infrastructure` — reservados para fases futuras
