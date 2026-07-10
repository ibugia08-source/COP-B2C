# Refactor crítico — go-live seguro (2026-07-09)

Rodada exclusiva de **segurança e bugs bloqueadores** antes do primeiro deploy
em produção. Arquitetura, UI e polimento ficaram explicitamente fora de escopo.
Cada item é um commit atômico; `typecheck + lint + test` verdes em todos.

## P0 — Segurança

| Item | Commit | Resumo |
|---|---|---|
| P0.1 Revogação de sessão | `da82f11` | JWT mínimo `{userId, sv}`; papéis/nome/e-mail reconsultados do banco a cada request (`session-server.ts`, `React.cache`). Mudar papéis/status incrementa `users.sessionVersion` e derruba sessões abertas no request seguinte. TTL 8h + sliding refresh no proxy. Redirect `/login?reason=session_revoked`. |
| P0.2 Ownership | `3353c2f` | Além do RBAC, escrever/revelar exige ser responsável pela entidade (`lib/auth/ownership.ts`). Cofre: só responsáveis pelo cliente do ativo; ativos internos só OWNER/ADMIN/GESTOR_OPERACIONAL. Listagens filtradas por escopo; páginas `[id]` redirecionam para `/acesso-negado`. Negações auditadas (`PERMISSION_DENIED` / `*.ownershipDenied`, `reason: ownership_scope`). |
| P0.3 Rate limiting | `c365028` | Tabela `login_attempts`; >5 falhas por e-mail ou >20 por IP em 15 min bloqueiam com mensagem genérica. Sucesso zera o contador do e-mail; retenção 7 dias. |
| P0.4 bcrypt async | `989b06a` | `hash/compare` assíncronos (cost 12 não bloqueia mais o event loop). |
| P0.5 AAD no cofre | `d946839` | AES-256-GCM com AAD `{secretId, assetId}` — swap de ciphertext entre registros falha na autenticação. `duplicateAsset` decripta/recripta no servidor. Migração: recriar segredos (sem produção) — ver DEPLOY.md. |
| P0.6 maskedPreview | `955c39b` | Coluna em texto claro removida; nenhuma prévia do segredo é persistida ou enviada ao cliente antes da revelação auditada. |
| P0.7 Storage | `1a41d85` | Interface `Storage` (local dev / Vercel Blob prod via `STORAGE_DRIVER`). Validação de MIME real (magic bytes, `file-type`) + whitelist por módulo + `MAX_UPLOAD_MB`. O bloqueio `if (process.env.VERCEL)` sumiu. |
| P0.8 DATABASE_URL | `23323a4` | Fallback fake removido: produção sem URL crasha no boot; build/dev sem env usam proxy que lança em qualquer query. |
| P0.9 Permissões | `e710cf1` | Fonte única: mapa estático `ROLE_PERMISSIONS`; tabelas `permissions`/`role_permissions` (nunca lidas em runtime) removidas. |
| P0.10 Auditoria | `8ec4462` | `writeAssetAuditStrict` na MESMA transação da revelação: auditoria falhou ⇒ plaintext não sai. Download de anexo audita antes de servir (503 se falhar). Falhas best-effort viram stderr JSON estruturado. |

## P1 — Bugs

| Item | Commit | Resumo |
|---|---|---|
| P1.1 FKs reais | `5b47d63` | `tasks.parentTaskId/digitalAssetId`, `documents.digitalAssetId`, `copilotSuggestions.taskId/digitalAssetId` com FK `ON DELETE SET NULL` + limpeza de órfãos na migration. |
| P1.2 notifyRole | `cf7a034` | Só usuários `isActive` + status `ATIVO` recebem notificações. |
| P1.3 Bulk sem N+1 | `8169230` | Bulk de ativos: ownership do lote em 1 query; lote inteiro falha listando IDs negados; UPDATE/DELETE únicos + INSERTs multi em transação. `applyTemplateToClient` insere tarefas em lote. |
| P1.4 Engine | `e7bf626` | Ações de uma regra em transação (rollback + log ERRO); operadores `eq/ne/in/gt/gte/lt/lte` com caminho pontilhado (retrocompatível com igualdade rasa); valores validados contra os enums (regra malformada ⇒ ERRO, dado intocado). Eventos derivados só após commit. |
| P1.5 Rotas públicas | `36cfc63` | `PUBLIC_PATHS` auditado: `/login`, `/acesso-negado`, `/api/health` (novo, sem banco). Documentado em DEPLOY.md. |
| P1.6 GIN | `2c61243` | Filtro de tag usava `LIKE` sobre jsonb (erro em runtime no Postgres) — agora containment `@>` + índices GIN `jsonb_path_ops` em `tasks.tags` e `digital_assets.tags`. Sem índices especulativos. |
| P1.7 Higiene | `c9f30da` | `creative_requests` (deprecated) removida com enums órfãos; comentário SQLite corrigido; README real em `apps/web`. |

## Decisões de segurança tomadas

- **Ativo sem cliente (INTERNO/PLATAFORMA)**: acesso restrito a
  OWNER/ADMIN/GESTOR_OPERACIONAL (`// SECURITY DECISION` em `ownership.ts`).
- **Tarefa interna sem cliente e sem responsável**: colaborativa (qualquer
  papel com a permissão escreve); com responsável, só o dono/criador/admins.
- **Bulk**: negação de UM item cancela o lote inteiro com os IDs — nunca pula
  em silêncio.
- **Fail-closed**: sem auditoria gravada, não há revelação de segredo nem
  download de anexo.
- **maskSecret removido por completo** — máscara persistida não protege quem
  tem SELECT no banco.
- **Journal do Drizzle ressincronizado** (P0.1): as migrations manuais
  0005–0008 antigas nunca entraram no `_journal.json`; foram consolidadas em
  `0005_resync-session-version.sql`. A cadeia 0000→0011 é a fonte de verdade.

## Dívidas arquiteturais NÃO endereçadas (próxima fase)

Estas permanecem de propósito (fora do escopo desta rodada):

1. **Sem service layer/repository** — regras de negócio, Drizzle, auditoria e
   `revalidatePath` seguem misturados em cada `actions.ts` (o maior,
   `ativos/actions.ts`, ~1000 linhas).
2. **Duplicação `clientes/` ↔ `operacao/`** — mesmo domínio `clients` com
   deletes/bulk duplicados (o gate de ownership foi duplicado junto,
   coerentemente nos dois lados).
3. **`schema.ts` monolítico** (~1.700 linhas) — não foi quebrado por domínio.
4. **Componentes-cliente gigantes** (`ui.tsx` de 400–600 linhas) — intocados.
5. **Bulk de clientes/tarefas ainda com loop por item** — P1.3 cobriu apenas
   os alvos nomeados (ativos + templates); os loops de `clientes/actions.ts`,
   `operacao/actions.ts` e `tarefas/actions.ts` seguem 1-a-1 (agora com gate
   de ownership por item, porém N+1).
6. **Busca global (`/busca`) e dashboard não aplicam o filtro de ownership**
   nas queries — listam por permissão apenas. Baixo risco (sem segredos), mas
   inconsistente com P0.2; corrigir na próxima fase.
7. **`revalidatePath` manual** por action — fácil esquecer rotas.
8. **Integrações stubadas** — WhatsApp real, Trello API, LLM do copiloto e
   Google Drive/Meet (`TODO(fase Google)` em `google-meet.ts` e
   `google-drive.ts`) continuam pendentes de propósito.
9. **Zod fragmentado** — schemas inline em cada `actions.ts`; só `client.ts`
   em `lib/validations/`.
10. **Sem testes de UI/e2e** — a suíte cobre funções puras + mocks de fluxo
    crítico (reveal/engine); server actions com banco real seguem sem teste.

## Como verificar

```bash
cd apps/web
npm run typecheck && npm run lint && npm run test   # 88 testes, sem banco/.env
```
