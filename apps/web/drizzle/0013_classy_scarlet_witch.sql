ALTER TABLE "client_pipeline_stages" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "client_pipeline_stages" CASCADE;--> statement-breakpoint
ALTER TABLE "clients" DROP CONSTRAINT "clients_main_responsible_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "clients_responsible_idx";--> statement-breakpoint
ALTER TABLE "automation_rules" DROP COLUMN "scope";--> statement-breakpoint
ALTER TABLE "clients" DROP COLUMN "main_responsible_id";