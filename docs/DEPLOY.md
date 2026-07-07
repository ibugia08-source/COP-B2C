# Deploy do COP B2C na Vercel (com Postgres/Neon)

O app é um Next.js em `apps/web` e usa **Postgres** (driver Neon serverless, que
funciona igual no dev local e na Vercel). Siga os passos abaixo.

## 1. Corrigir o Root Directory (resolve o 404 NOT_FOUND)

O 404 da Vercel acontece porque o app está em `apps/web`, não na raiz do repo.

1. Vercel → seu projeto → **Settings → Build and Deployment**.
2. Em **Root Directory**, defina: `apps/web`.
3. Framework Preset: **Next.js** (detectado automaticamente). Salve.

## 2. Criar o banco Postgres

Opção A — **Vercel Postgres**: aba **Storage → Create Database → Postgres**.
Ele cria a variável `DATABASE_URL` (e afins) automaticamente no projeto.

Opção B — **Neon** (neon.tech, plano free): crie um projeto e copie a
**connection string pooled** (algo como
`postgresql://usuario:senha@ep-xxxx-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require`).

## 3. Variáveis de ambiente na Vercel

Em **Settings → Environment Variables**, adicione (Production + Preview):

| Nome | Valor |
|---|---|
| `DATABASE_URL` | connection string do Postgres (com `?sslmode=require`) |
| `AUTH_SECRET` | gere com `openssl rand -base64 48` |
| `VAULT_ENCRYPTION_KEY` | gere com `openssl rand -hex 32` (32 bytes = 64 chars) |

> ⚠️ Guarde `VAULT_ENCRYPTION_KEY` em local seguro. Perdê-la = perder todos os
> segredos criptografados do Banco de Ativos Digitais.

## 4. Criar as tabelas e popular o banco

Na sua máquina, aponte o `.env` de `apps/web` para o **mesmo** `DATABASE_URL` e rode:

```bash
cd apps/web
npm install
npm run db:push     # cria as tabelas no Postgres
npm run db:seed     # papéis, permissões, usuários e dados de exemplo
```

(Alternativa versionada: `npm run db:migrate`, que aplica `drizzle/0000_baseline-pg.sql`.)

## 5. Redeploy

Com Root Directory + env vars configurados, faça **Redeploy** (ou um novo push).
O login inicial é `owner@b2cgestao.com.br` / `cop123456` — **troque a senha do seed**
antes de uso real.

## Observações

- **Dev local** usa o mesmo driver: basta ter `DATABASE_URL` no `apps/web/.env`
  apontando para um Postgres (pode ser o próprio Neon, ou uma branch dele). Não é
  mais necessário instalar Postgres localmente.
- **Upload de anexos** (aba Anexos do Banco de Ativos) grava em disco local, que a
  Vercel não persiste. Em produção esse botão fica bloqueado com aviso; para
  habilitar, integrar Vercel Blob ou S3 (Fase 2). Todo o resto do módulo
  (credenciais criptografadas, comentários, auditoria) funciona normalmente.
- **Migrations**: `npm run db:generate` gera SQL a partir do schema; o baseline
  Postgres está em `apps/web/drizzle/0000_baseline-pg.sql`.
