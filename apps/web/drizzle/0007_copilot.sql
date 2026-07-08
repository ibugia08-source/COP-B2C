CREATE TABLE IF NOT EXISTS "copilot_suggestions" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "client_id" text REFERENCES "clients"("id") ON DELETE SET NULL,
  "task_id" text,
  "digital_asset_id" text,
  "type" text NOT NULL DEFAULT 'OUTRO',
  "title" text NOT NULL,
  "description" text,
  "suggested_action" text NOT NULL,
  "priority" text NOT NULL DEFAULT 'MEDIA',
  "status" text NOT NULL DEFAULT 'PENDENTE',
  "source" text NOT NULL DEFAULT 'REGRAS',
  "ai_reasoning_summary" text,
  "dedupe_key" text,
  "resolved_by_id" text REFERENCES "users"("id"),
  "resolved_at" timestamp,
  "executed_task_id" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "copilot_suggestions_user_idx" ON "copilot_suggestions" ("user_id","status");
CREATE INDEX IF NOT EXISTS "copilot_suggestions_dedupe_idx" ON "copilot_suggestions" ("dedupe_key");

CREATE TABLE IF NOT EXISTS "whatsapp_connections" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "provider" text NOT NULL DEFAULT 'NAO_DEFINIDO',
  "phone_number" text,
  "status" text NOT NULL DEFAULT 'NAO_CONECTADO',
  "connected_at" timestamp,
  "disconnected_at" timestamp,
  "metadata" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "monitored_conversations" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "connection_id" text REFERENCES "whatsapp_connections"("id") ON DELETE SET NULL,
  "type" text NOT NULL DEFAULT 'GRUPO',
  "external_conversation_id" text,
  "display_name" text NOT NULL,
  "client_id" text REFERENCES "clients"("id") ON DELETE SET NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "monitored_conversations_user_idx" ON "monitored_conversations" ("user_id");

CREATE TABLE IF NOT EXISTS "conversation_summaries" (
  "id" text PRIMARY KEY NOT NULL,
  "conversation_id" text NOT NULL REFERENCES "monitored_conversations"("id") ON DELETE CASCADE,
  "client_id" text REFERENCES "clients"("id") ON DELETE SET NULL,
  "summary" text NOT NULL,
  "key_points" jsonb NOT NULL DEFAULT '[]',
  "objections" jsonb NOT NULL DEFAULT '[]',
  "doubts" jsonb NOT NULL DEFAULT '[]',
  "pending_actions" jsonb NOT NULL DEFAULT '[]',
  "sentiment" text NOT NULL DEFAULT 'NEUTRO',
  "priority" text NOT NULL DEFAULT 'MEDIA',
  "source" text NOT NULL DEFAULT 'SIMULACAO',
  "created_by_id" text REFERENCES "users"("id"),
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "conversation_summaries_conv_idx" ON "conversation_summaries" ("conversation_id");
