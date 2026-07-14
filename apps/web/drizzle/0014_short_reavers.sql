ALTER TABLE "clients" ADD COLUMN "board_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Backfill: preserva a ordem atual (por data de criacao) dentro de cada etapa.
UPDATE "clients" c SET "board_order" = s.rn FROM (
  SELECT id, (row_number() OVER (PARTITION BY pipeline_stage ORDER BY created_at) * 10) AS rn FROM "clients"
) s WHERE c.id = s.id;