CREATE TABLE "conversation_summaries" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"client_id" text,
	"summary" text NOT NULL,
	"key_points" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"objections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"doubts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pending_actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sentiment" text DEFAULT 'NEUTRO' NOT NULL,
	"priority" text DEFAULT 'MEDIA' NOT NULL,
	"source" text DEFAULT 'SIMULACAO' NOT NULL,
	"created_by_id" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "copilot_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"suggestion_id" text NOT NULL,
	"action_type" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'PENDENTE' NOT NULL,
	"approved_by_id" text,
	"executed_at" timestamp,
	"error_message" text,
	"result_summary" text,
	"result_ref" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "copilot_suggestions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"client_id" text,
	"task_id" text,
	"digital_asset_id" text,
	"type" text DEFAULT 'OUTRO' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"suggested_action" text NOT NULL,
	"priority" text DEFAULT 'MEDIA' NOT NULL,
	"status" text DEFAULT 'PENDENTE' NOT NULL,
	"source" text DEFAULT 'REGRAS' NOT NULL,
	"ai_reasoning_summary" text,
	"dedupe_key" text,
	"resolved_by_id" text,
	"resolved_at" timestamp,
	"executed_task_id" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monitored_conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"connection_id" text,
	"type" text DEFAULT 'GRUPO' NOT NULL,
	"external_conversation_id" text,
	"display_name" text NOT NULL,
	"client_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text DEFAULT 'NAO_DEFINIDO' NOT NULL,
	"phone_number" text,
	"status" text DEFAULT 'NAO_CONECTADO' NOT NULL,
	"connected_at" timestamp,
	"disconnected_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "whatsapp_connections_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "source_type" text DEFAULT 'INTERNAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "file_url" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "storage_path" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "mime_type" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "google_drive_file_id" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "google_drive_url" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "digital_asset_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "creative" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "session_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_summaries" ADD CONSTRAINT "conversation_summaries_conversation_id_monitored_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."monitored_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_summaries" ADD CONSTRAINT "conversation_summaries_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_summaries" ADD CONSTRAINT "conversation_summaries_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copilot_actions" ADD CONSTRAINT "copilot_actions_suggestion_id_copilot_suggestions_id_fk" FOREIGN KEY ("suggestion_id") REFERENCES "public"."copilot_suggestions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copilot_actions" ADD CONSTRAINT "copilot_actions_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copilot_suggestions" ADD CONSTRAINT "copilot_suggestions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copilot_suggestions" ADD CONSTRAINT "copilot_suggestions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copilot_suggestions" ADD CONSTRAINT "copilot_suggestions_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitored_conversations" ADD CONSTRAINT "monitored_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitored_conversations" ADD CONSTRAINT "monitored_conversations_connection_id_whatsapp_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."whatsapp_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitored_conversations" ADD CONSTRAINT "monitored_conversations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_connections" ADD CONSTRAINT "whatsapp_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_summaries_conv_idx" ON "conversation_summaries" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "copilot_actions_suggestion_idx" ON "copilot_actions" USING btree ("suggestion_id","status");--> statement-breakpoint
CREATE INDEX "copilot_suggestions_user_idx" ON "copilot_suggestions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "copilot_suggestions_dedupe_idx" ON "copilot_suggestions" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "monitored_conversations_user_idx" ON "monitored_conversations" USING btree ("user_id");