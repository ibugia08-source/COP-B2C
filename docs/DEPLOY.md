# Deploy do COP B2C na Vercel (com Postgres/Neon)

O app é um Next.js em `apps/web` e usa **Postgres** (driver Neon serverless, que
funciona igual no dev local e na Vercel). Siga os passos abaixo.

## 1. Corrigir o Root Directory (resolve o 404 NOT_FOUND)

O 404 da Vercel acontece porque o app está em `apps/web`, não na raiz do repo.

1. Vercel → seu projeto → **Settings → Build and Deployment**.
2. Em **Root Directory**, defina: `apps/web`.
3. Framework Preset: **Next.js** (detectado automaticamente). Salve.

## 2. Banco Postgres

O app usa **postgres.js**, compatível com **Supabase**, Neon ou Vercel Postgres.

Com Supabase, há duas URLs (Settings → Database):
- **Session / porta 5432** — use para `db:push` e `db:seed` (comandos de DDL).
- **Transaction pooler / porta 6543** — use no runtime da Vercel (serverless).

O banco já foi criado e populado neste projeto (tabelas + seed aplicados).

## 3. Variáveis de ambiente na Vercel

Em **Settings → Environment Variables**, adicione (Production + Preview):

| Nome | Valor |
|---|---|
| `DATABASE_URL` | URL do **pooler de transação** (Supabase porta 6543) com `?sslmode=require` — **obrigatória**: sem ela o app agora falha no boot com erro claro (o fallback silencioso foi removido) |
| `AUTH_SECRET` | o mesmo valor usado no seed (veja abaixo) |
| `VAULT_ENCRYPTION_KEY` | **o mesmo** usado no seed — obrigatório para decriptar os segredos |
| `STORAGE_DRIVER` | `vercel_blob` em produção (default quando `NODE_ENV=production`); `local` só em dev |
| `BLOB_READ_WRITE_TOKEN` | token do Vercel Blob (Vercel → Storage → Blob) — obrigatório com `vercel_blob` |
| `MAX_UPLOAD_MB` | limite de upload em MB (opcional; default 25) |

> A `VAULT_ENCRYPTION_KEY` na Vercel precisa ser **idêntica** à usada quando o
> `db:seed` rodou, senão os segredos do Banco de Ativos não descriptografam.
> Os valores gerados nesta configuração foram entregues no chat — guarde-os.

> ⚠️ Guarde `VAULT_ENCRYPTION_KEY` em local seguro. Perdê-la = perder todos os
> segredos criptografados do Banco de Ativos Digitais.

## 4. Criar as tabelas e popular o banco

Na sua máquina, aponte o `.env` de `apps/web` para o **mesmo** `DATABASE_URL` e rode:

```bash
cd apps/web
npm install
npm run db:push     # cria as tabelas no Postgres
npm run db:seed     # papéis, templates, automações e configuração (SEM dados de exemplo)
```

(Alternativa versionada: `npm run db:migrate`, que aplica `drizzle/0000_baseline-pg.sql`.)

### Migração dos segredos para o formato com AAD (refactor 2026-07)

O cofre passou a criptografar com **AES-256-GCM + AAD** (`{secretId, assetId}`),
que vincula cada ciphertext ao seu registro — segredos gravados no formato
antigo (sem AAD) **não decriptam mais**. Como não havia produção rodando,
o caminho adotado foi **recriar os segredos**: truncar a tabela e recadastrar
(ou rodar `db:seed` de novo em dev):

```sql
TRUNCATE TABLE digital_asset_secrets;
```

Se algum dia existirem segredos legados a preservar, escreva um script que
decripta sem AAD e recripta com AAD antes de subir esta versão.

## 5. Redeploy

Com Root Directory + env vars configurados, faça **Redeploy** (ou um novo push).
O seed é só de configuração (papéis/templates/automações) e **não cria dados de
exemplo**. Num banco totalmente vazio, ele cria um único OWNER de bootstrap
(`owner@b2cgestao.com.br` / `cop123456`) — **troque a senha no primeiro login**;
num banco que já tem usuários, nenhum usuário é criado.

## Checklist de produção

1. Envs obrigatórias configuradas: `DATABASE_URL`, `AUTH_SECRET`,
   `VAULT_ENCRYPTION_KEY`, `BLOB_READ_WRITE_TOKEN` (com `STORAGE_DRIVER=vercel_blob`).
   Sem `DATABASE_URL` o app **crasha no boot de propósito** (fallback removido).
2. `npm run db:push` (URL direta/5432) e `npm run db:seed` rodados com os
   MESMOS `AUTH_SECRET`/`VAULT_ENCRYPTION_KEY` da Vercel.
3. Segredos do cofre: recadastrados no formato com AAD (ver seção acima).
4. `/api/health` responde `{ ok: true }` no domínio de produção.
5. Uploads funcionam (Vercel Blob) — não existe mais bloqueio `if (VERCEL)`.
6. Sem usuários/dados de exemplo no banco (o seed atual não os cria; a limpeza
   dos mocks antigos foi feita em 2026-07-10). Se o OWNER de bootstrap foi
   criado, senha trocada.

## Rotas públicas (sem sessão)

O middleware (`apps/web/src/proxy.ts`) exige sessão em tudo, exceto:

| Rota | Motivo |
|---|---|
| `/login` | tela de entrada — o auto-cadastro é uma aba dela (não existe `/signup`) |
| `/acesso-negado` | destino dos redirects de permissão |
| `/api/health` | health check para monitoramento/uptime (não toca no banco) |

Qualquer página pública nova precisa entrar em `PUBLIC_PATHS` no proxy.

## Observações

- **Dev local** usa o mesmo driver: basta ter `DATABASE_URL` no `apps/web/.env`
  apontando para um Postgres (pode ser o próprio Neon, ou uma branch dele). Não é
  mais necessário instalar Postgres localmente.
- **Upload de anexos** usa a abstração de storage: `STORAGE_DRIVER=vercel_blob`
  em produção (com `BLOB_READ_WRITE_TOKEN`) e `local` em dev. Uploads são
  validados por conteúdo (magic bytes) contra uma whitelist; downloads
  sensíveis passam pela rota autenticada com verificação de ownership.
- **Migrations**: `npm run db:generate` gera SQL a partir do schema; o baseline
  Postgres está em `apps/web/drizzle/0000_baseline-pg.sql`.

## Integração Google Meet / Calendar (opcional — reuniões)

O módulo de Reuniões funciona 100% manualmente (cola-se o link do Meet). Com as
variáveis abaixo configuradas (local e Vercel) **e** a flag "Google Meet" ligada
em Configurações → Serviços & Módulos, o botão "Gerar link Meet" cria um evento
real na agenda primária da conta robô (Calendar API com `conferenceData`) e
devolve o link:

| Variável | Descrição |
|---|---|
| `GOOGLE_CLIENT_ID` | Client ID do OAuth (Google Cloud Console → Credentials) |
| `GOOGLE_CLIENT_SECRET` | Client Secret do OAuth (só aparece na criação — guarde) |
| `GOOGLE_REDIRECT_URI` | ex.: `https://SEU_DOMINIO/api/google/callback` |
| `GOOGLE_REFRESH_TOKEN` | refresh token da conta robô, gerado no OAuth Playground com os escopos `drive.readonly` + `calendar.events` |

> O app OAuth precisa estar **publicado** ("In production") no consent screen —
> em modo Testing o refresh token expira em 7 dias. Se o Google responder
> `invalid_grant`, gere um refresh token novo no OAuth Playground.

Sem essas variáveis, o botão "Gerar link Meet" fica desabilitado com aviso — o
sistema não quebra.

## Integração Google Drive (opcional — documentos)

O módulo Documentos funciona 100% sem o Drive: dá para colar links do Drive/Docs
manualmente, fazer upload de arquivos e cadastrar links externos. Com as
**mesmas** variáveis `GOOGLE_*` acima (a conta robô precisa de acesso ao Drive
da agência) e a flag "Google Drive em Documentos" ligada, o botão
"Selecionar do Drive" no formulário de documentos abre um seletor que busca os
arquivos por nome na Drive API (`files.list`, somente leitura) e preenche o
link. Enquanto as credenciais não existirem, a área em Configurações →
Integrações mostra "Não conectado" e o botão fica desabilitado — nada quebra.

> Uploads de arquivos usam o storage configurado (`STORAGE_DRIVER`): Vercel Blob
> em produção, disco local em dev. Ver seção de variáveis de ambiente.
