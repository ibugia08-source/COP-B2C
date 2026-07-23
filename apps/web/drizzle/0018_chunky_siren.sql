ALTER TABLE "tasks" ADD COLUMN "board_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Backfill: numera cada coluna (status) na MESMA ordem que a tela já exibia
-- (vencimento, depois criação), com folga de 10. Sem isso todos ficariam em 0 e
-- o primeiro arraste reembaralharia os cards.
UPDATE "tasks" AS t SET "board_order" = o.ord
FROM (
  SELECT id,
         (row_number() OVER (PARTITION BY status ORDER BY due_date NULLS LAST, created_at)) * 10 AS ord
  FROM "tasks"
) AS o
WHERE t.id = o.id;
