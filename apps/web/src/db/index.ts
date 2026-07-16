import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Postgres via postgres.js — compatível com Supabase (pooler pgbouncer) e com
// qualquer Postgres padrão. Funciona igual no dev local e na Vercel.
//
// DATABASE_URL é a principal; POSTGRES_URL é o fallback (a integração do
// Supabase/Vercel define POSTGRES_URL automaticamente).
// - Runtime na Vercel: use a URL do POOLER (porta 6543).
// - Migrations/seed (db:push, db:seed): use a URL DIRETA (porta 5432).
const url = process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim();
const isPg = !!url && /^postgres(ql)?:\/\//i.test(url);

// Durante o `next build` os módulos são importados sem env de runtime — nesse
// caso (e só nesse) o cliente vira um proxy que lança em qualquer query.
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

const MISSING_URL_ERROR =
  "DATABASE_URL/POSTGRES_URL ausente ou inválida. Defina no ambiente (apps/web/.env em dev; " +
  "Vercel → Settings → Environment Variables em produção). Veja docs/DEPLOY.md.";

/**
 * Cliente-fantasma para import em build/dev sem env: o drizzle() só toca em
 * client.options.parsers/serializers na construção; qualquer QUERY lança um
 * erro claro em vez de tentar conectar num host inexistente.
 */
function throwingClient(): ReturnType<typeof postgres> {
  const options = { parsers: {}, serializers: {} };
  return new Proxy(function () {} as unknown as ReturnType<typeof postgres>, {
    get(_target, prop) {
      if (prop === "options") return options;
      if (prop === "then") return undefined; // não é thenable
      throw new Error(MISSING_URL_ERROR);
    },
    apply() {
      throw new Error(MISSING_URL_ERROR);
    },
  });
}

// Em dev, o Turbopack/Next recarrega este módulo a cada alteração de arquivo.
// Sem cachear o cliente, cada reload abria um NOVO pool do postgres.js sem
// fechar o anterior; em session mode (pooler porta 5432, teto de 15 conexões)
// os pools vazados acumulam até estourar: `EMAXCONNSESSION max clients reached`.
// Guardar o cliente no globalThis faz o HMR reaproveitar o mesmo pool.
const globalForDb = globalThis as unknown as {
  __copPgClient?: ReturnType<typeof postgres>;
};

let client: ReturnType<typeof postgres>;
if (isPg) {
  // prepare:false é necessário para o pooler do Supabase em modo "transaction".
  // A conexão é lazy: nada é aberto durante o import.
  // NOTA: max:1 QUEBROU produção (telas travando em "carregando") — em session
  // mode uma única conexão serializa tudo. NÃO reduzir o max de produção.
  // idle_timeout fecha conexões ociosas (higiene, evita acúmulo no pooler);
  // em dev o max é menor só para deixar folga sob o teto de 15 do pooler.
  const isProd = process.env.NODE_ENV === "production";
  client =
    globalForDb.__copPgClient ??
    postgres(url!, {
      prepare: false,
      idle_timeout: 20,
      max: isProd ? 10 : 5,
    });
  // Cachear apenas em dev — em produção (serverless) o módulo é avaliado uma vez
  // por instância, então não há reload e o cache é desnecessário.
  if (!isProd) globalForDb.__copPgClient = client;
} else if (process.env.NODE_ENV === "production" && !isBuildPhase) {
  // Produção sem banco = crash imediato e explícito no boot — nunca um
  // fallback silencioso apontando para um host fake.
  throw new Error(MISSING_URL_ERROR);
} else {
  if (!isBuildPhase && process.env.NODE_ENV !== "test") {
    console.warn(`[db] ${MISSING_URL_ERROR}`);
  }
  client = throwingClient();
}

export const db = drizzle(client, { schema });
export * as dbSchema from "./schema";
