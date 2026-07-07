import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Postgres (Neon serverless HTTP) — mesmo driver funciona no dev local e na
// Vercel, sem conexões TCP persistentes. Defina DATABASE_URL no .env (local)
// e nas Environment Variables do projeto na Vercel (produção).
//
// Durante o `next build` a conexão nunca é usada (todas as páginas consultam o
// banco em tempo de requisição). Como o build pode rodar sem a env disponível,
// usamos um placeholder com formato válido para não quebrar o build; em runtime
// a DATABASE_URL real (definida na Vercel) é sempre usada.
const PLACEHOLDER = "postgresql://build:build@build.example.com/neondb?sslmode=require";
const url = process.env.DATABASE_URL?.trim();
const isPostgresUrl = !!url && /^postgres(ql)?:\/\//i.test(url);

if (!isPostgresUrl && process.env.NODE_ENV !== "production") {
  console.warn("[db] DATABASE_URL ausente ou inválida — usando placeholder (nenhuma query funcionará).");
}

const sql = neon(isPostgresUrl ? url! : PLACEHOLDER);

export const db = drizzle(sql, { schema });
export * as dbSchema from "./schema";
