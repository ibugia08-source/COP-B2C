// Aplica migrações do drizzle via postgres.js — substituto do `drizzle-kit migrate`,
// que TRAVA neste Supabase (driver `pg` na negociação SSL do host direto).
//
// Uso: npm run db:migrate:direct   (equivale a: node --env-file=.env scripts/apply-migrations.mjs)
//
// SEGURO: pula migrações já aplicadas comparando o sha256 do arquivo .sql com o
// registro em drizzle.__drizzle_migrations (mesmo algoritmo do drizzle-kit —
// verificado: 18/18 hashes batiam). Só aplica as pendentes, em ordem, em transação.
//
// ATENÇÃO: usa DATABASE_URL do .env. Se o .env aponta para PRODUÇÃO, isto altera a
// produção. Rode consciente e, para mudanças de tipo de coluna, coordene com o deploy
// do código (ver docs/DEPLOY-DB.md).
import postgres from "postgres";
import { readFileSync } from "fs";
import { createHash } from "crypto";

const url = process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim();
if (!url) {
  console.error("DATABASE_URL/POSTGRES_URL ausente. Rode com: npm run db:migrate:direct");
  process.exit(1);
}
const sql = postgres(url, { prepare: false, idle_timeout: 5, max: 1, onnotice: () => {} });

try {
  await sql`create schema if not exists drizzle`;
  await sql`create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)`;

  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
  const applied = new Set((await sql`select hash from drizzle.__drizzle_migrations`).map((r) => r.hash));

  let n = 0;
  for (const e of [...journal.entries].sort((a, b) => a.idx - b.idx)) {
    const content = readFileSync(`drizzle/${e.tag}.sql`, "utf8");
    const hash = createHash("sha256").update(content).digest("hex");
    if (applied.has(hash)) continue; // já aplicada — nunca reroda
    const statements = content.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
    await sql.begin(async (tx) => {
      for (const st of statements) await tx.unsafe(st);
      await tx`insert into drizzle.__drizzle_migrations (hash, created_at) values (${hash}, ${e.when})`;
    });
    console.log(`✅ aplicada ${e.tag} (${statements.length} statements)`);
    n++;
  }
  console.log(n ? `\n${n} migração(ões) aplicada(s).` : "Nada pendente — o banco já está atualizado.");
} catch (e) {
  console.error("FALHA:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
