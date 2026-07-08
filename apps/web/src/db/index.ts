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

if (!isPg && process.env.NODE_ENV !== "production") {
  console.warn("[db] DATABASE_URL/POSTGRES_URL ausente ou inválida — nenhuma query funcionará.");
}

// prepare:false é necessário para o pooler do Supabase em modo "transaction".
// A conexão é lazy: nada é aberto durante o `next build`.
const client = postgres(isPg ? url! : "postgres://build:build@build.example.com/neondb", {
  prepare: false,
});

export const db = drizzle(client, { schema });
export * as dbSchema from "./schema";
