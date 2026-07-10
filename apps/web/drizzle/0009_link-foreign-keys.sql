-- Limpeza de órfãos antes das constraints (vínculos "soltos" pré-existentes)
UPDATE "tasks" SET "parent_task_id" = NULL WHERE "parent_task_id" IS NOT NULL AND "parent_task_id" NOT IN (SELECT "id" FROM "tasks");--> statement-breakpoint
UPDATE "tasks" SET "digital_asset_id" = NULL WHERE "digital_asset_id" IS NOT NULL AND "digital_asset_id" NOT IN (SELECT "id" FROM "digital_assets");--> statement-breakpoint
UPDATE "documents" SET "digital_asset_id" = NULL WHERE "digital_asset_id" IS NOT NULL AND "digital_asset_id" NOT IN (SELECT "id" FROM "digital_assets");--> statement-breakpoint
UPDATE "copilot_suggestions" SET "task_id" = NULL WHERE "task_id" IS NOT NULL AND "task_id" NOT IN (SELECT "id" FROM "tasks");--> statement-breakpoint
UPDATE "copilot_suggestions" SET "digital_asset_id" = NULL WHERE "digital_asset_id" IS NOT NULL AND "digital_asset_id" NOT IN (SELECT "id" FROM "digital_assets");--> statement-breakpoint
ALTER TABLE "copilot_suggestions" ADD CONSTRAINT "copilot_suggestions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copilot_suggestions" ADD CONSTRAINT "copilot_suggestions_digital_asset_id_digital_assets_id_fk" FOREIGN KEY ("digital_asset_id") REFERENCES "public"."digital_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_digital_asset_id_digital_assets_id_fk" FOREIGN KEY ("digital_asset_id") REFERENCES "public"."digital_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_task_id_tasks_id_fk" FOREIGN KEY ("parent_task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_digital_asset_id_digital_assets_id_fk" FOREIGN KEY ("digital_asset_id") REFERENCES "public"."digital_assets"("id") ON DELETE set null ON UPDATE no action;
