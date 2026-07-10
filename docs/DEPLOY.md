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
| `DATABASE_URL` | URL do **pooler de transação** (Supabase porta 6543) com `?sslmode=require` |
| `AUTH_SECRET` | o mesmo valor usado no seed (veja abaixo) |
| `VAULT_ENCRYPTION_KEY` | **o mesmo** usado no seed — obrigatório para decriptar os segredos |

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
npm run db:seed     # papéis, permissões, usuários e dados de exemplo
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

## Integração Google Meet / Calendar (opcional — reuniões)

O módulo de Reuniões funciona 100% manualmente (cola-se o link do Meet). Para
gerar links automaticamente no futuro, configure na Vercel e ligue a flag
"Google Meet" em Configurações → Serviços & Módulos:

| Variável | Descrição |
|---|---|
| `GOOGLE_CLIENT_ID` | Client ID do OAuth (Google Cloud Console) |
| `GOOGLE_CLIENT_SECRET` | Client Secret do OAuth |
| `GOOGLE_REDIRECT_URI` | ex.: `https://SEU_DOMINIO/api/google/callback` |
| `GOOGLE_REFRESH_TOKEN` | refresh token da conta robô da agência (Calendar API) |

Sem essas variáveis, o botão "Gerar link Meet" fica desabilitado com aviso — o
sistema não quebra.

## Integração Google Drive (opcional — documentos)

O módulo Documentos funciona 100% sem o Drive: dá para colar links do Drive/Docs
manualmente, fazer upload de arquivos e cadastrar links externos. Para habilitar a
seleção de arquivos direto do Drive (fase futura), use as **mesmas** variáveis
`GOOGLE_*` acima (a conta robô precisa de acesso ao Drive da agência) e clique em
"Conectar Google Drive" em **Configurações → Integrações**. Enquanto as credenciais
não existirem, a área mostra "Não conectado / Configuração pendente" e o botão
"Selecionar arquivo do Drive" fica desabilitado — nada quebra.

> Uploads de arquivos gravam em disco local; na Vercel (filesystem efêmero) o upload
> fica bloqueado com aviso — use link externo/Drive ou configure Vercel Blob/S3.
