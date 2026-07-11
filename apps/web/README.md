# COP B2C — app web

Este é o app Next.js do **COP B2C** (Central Operacional da B2C Gestão).
A documentação real do projeto está na **raiz do repositório**:

- [`../../README.md`](../../README.md) — visão geral, módulos e comandos
- [`../../docs/PRD.md`](../../docs/PRD.md) — requisitos de produto
- [`../../docs/DEPLOY.md`](../../docs/DEPLOY.md) — deploy (Vercel + Postgres), envs e rotas públicas
- [`../../docs/IMPORTACAO.md`](../../docs/IMPORTACAO.md) — importadores ClickUp/Trello
- [`../../docs/REFACTOR-CRITICO.md`](../../docs/REFACTOR-CRITICO.md) — refactor de segurança pré-go-live

## Comandos

```bash
npm run dev        # servidor de desenvolvimento
npm run build      # build de produção
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm run test       # vitest (não precisa de banco nem .env)
npm run db:push    # aplica o schema no Postgres (DDL)
npm run db:seed    # papéis, templates e configuração (sem dados de exemplo)
```

Envs obrigatórias em `.env` (veja `.env.example`): `DATABASE_URL`,
`AUTH_SECRET`, `VAULT_ENCRYPTION_KEY` (+ `STORAGE_DRIVER`/`BLOB_READ_WRITE_TOKEN`
para uploads em produção).

> **Atenção**: este projeto usa Next.js 16 com breaking changes — leia
> `AGENTS.md` e `node_modules/next/dist/docs/` antes de mexer em rotas,
> middleware (`src/proxy.ts`) ou `params`/`searchParams` (são Promises).
