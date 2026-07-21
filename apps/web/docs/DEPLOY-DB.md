# Deploy e Banco — lições para não repetir erros

Três armadilhas reais que já causaram problema neste projeto. Leia antes de mexer em migração, deploy ou performance.

## 1. Migração de tipo de coluna QUEBRA o código já deployado

Mudar o **tipo** de uma coluna (ex.: `timestamp` → `date`) pode quebrar a versão que **já está no ar**, porque o código antigo espera o formato antigo.

Caso real: migramos `start_date` etc. para `date`, mas o deploy da Vercel ainda era o código antigo, que fazia `new Date(valor + "+0000")`. Com `date` puro (`"2026-07-21"`), virou `Invalid Date` → **produção fora do ar** (`RangeError: Invalid time value`).

**Regra:** para migração que muda tipo de coluna, **o código que entende o novo tipo tem que estar no ar junto (ou antes)**. Ordem segura:
1. Faça o código novo **tolerar os dois formatos** (se possível) e deploye.
2. Só então rode a migração.

Se não der para tolerar os dois, **deploy do código novo + migração devem ir juntos**, com o mínimo de janela entre eles.

## 2. `drizzle-kit migrate` TRAVA neste Supabase — use `db:migrate:direct`

O `npm run db:migrate` (drizzle-kit, driver `pg`) **trava** na negociação SSL do host do Supabase. O postgres.js (mesmo driver do app) conecta normal.

**Use:**
```bash
npm run db:migrate:direct
```
Isso roda `scripts/apply-migrations.mjs`, que aplica as migrações pendentes via postgres.js. É seguro: pula as já aplicadas comparando o sha256 do `.sql` com `drizzle.__drizzle_migrations` (mesmo algoritmo do drizzle-kit), aplica só as novas, em ordem e em transação.

> `drizzle-kit generate` (criar o `.sql`) funciona normal — o problema é só o `migrate`.
> Migração que muda tipo costuma sair sem `USING`; adicione à mão (ex.: `... TYPE date USING col::date`).

## 3. Latência: a função da Vercel PRECISA ficar em `gru1` (São Paulo)

O banco está em **Supabase sa-east-1 (São Paulo)**. Se a função serverless rodar no padrão da Vercel (**iad1 / Washington**), cada query cruza EUA↔Brasil (~250ms) e as páginas ficam lentas — mesmo com query sub-ms.

Já está fixado em `vercel.json` (`"regions": ["gru1"]`). **Se as páginas ficarem lentas de novo**, confira no log da Vercel o "Routed to ..." do *Function Invocation*: tem que ser **gru1**. Impacto medido: `/operacao` de ~4s para ~66ms.

## 4. Datas só-dia = coluna `date` + `lib/date.ts`

Campos data-only (entrada do cliente, prazo de tarefa, período de meta, revisão de ativo) são coluna **`date`** e trafegam como string `"YYYY-MM-DD"`. **Nunca** use `new Date()`, `.toISOString()` ou `.toLocaleDateString()` neles — use `lib/date.ts` (`formatDateOnly`, `todayDateOnly`, `addDaysDateOnly`, `isDateOnlyOverdue`, `dateOnlyToLocalDate`). Colunas com hora (reunião, createdAt, etc.) seguem `timestamp` normal.
