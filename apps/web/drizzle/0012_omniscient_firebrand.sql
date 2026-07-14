ALTER TABLE "clients" ADD COLUMN "is_paused" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "paused_at" timestamp;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "pause_reason" text;--> statement-breakpoint
-- Backfill do modelo de estado canonico (Onda 2 da rearquitetura).
-- Pausa comercial: ex-etapa PAUSADO vira flag is_paused; cliente volta a Base sem perder posicao.
UPDATE "clients" SET "is_paused" = true, "paused_at" = now() WHERE "pipeline_stage" = 'PAUSADO';--> statement-breakpoint
UPDATE "clients" SET "pipeline_stage" = 'BASE_DE_CLIENTES' WHERE "pipeline_stage" = 'PAUSADO';--> statement-breakpoint
-- Ex-etapas de estado viram saude e voltam a Base.
UPDATE "clients" SET "health_status" = 'OBSERVACAO' WHERE "pipeline_stage" = 'EM_OBSERVACAO' AND "health_status" = 'ESTAVEL';--> statement-breakpoint
UPDATE "clients" SET "health_status" = 'CRITICO' WHERE "pipeline_stage" = 'CLIENTE_CRITICO';--> statement-breakpoint
UPDATE "clients" SET "pipeline_stage" = 'BASE_DE_CLIENTES' WHERE "pipeline_stage" IN ('EM_OBSERVACAO', 'CLIENTE_CRITICO');--> statement-breakpoint
-- Recomputa status (derivado): PERDIDO > PAUSADO > EM_RISCO > mapeado-da-etapa.
UPDATE "clients" SET "status" = 'PERDIDO' WHERE "pipeline_stage" = 'CLIENTE_PERDIDO';--> statement-breakpoint
UPDATE "clients" SET "status" = 'PAUSADO' WHERE "is_paused" = true AND "pipeline_stage" <> 'CLIENTE_PERDIDO';--> statement-breakpoint
UPDATE "clients" SET "status" = 'EM_RISCO' WHERE "health_status" = 'CRITICO' AND "is_paused" = false AND "pipeline_stage" <> 'CLIENTE_PERDIDO';--> statement-breakpoint
UPDATE "clients" SET "status" = 'ATIVO' WHERE "pipeline_stage" = 'BASE_DE_CLIENTES' AND "is_paused" = false AND "health_status" <> 'CRITICO';--> statement-breakpoint
UPDATE "clients" SET "status" = 'ONBOARDING' WHERE "pipeline_stage" = 'NOVO_CLIENTE' AND "is_paused" = false AND "health_status" <> 'CRITICO';--> statement-breakpoint
UPDATE "clients" SET "status" = 'IMPLANTACAO' WHERE "pipeline_stage" IN ('CRIACAO_DE_GRUPO','INTEGRACAO_META','INTEGRACAO_GOOGLE','PESQUISA_DE_MERCADO','DIAGNOSTICO_ESTRATEGICO','ESTUDO_DE_FUNIL','INTEGRACAO_SOCIAL_MEDIA','CRM') AND "is_paused" = false AND "health_status" <> 'CRITICO';