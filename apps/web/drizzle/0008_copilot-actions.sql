CREATE TABLE IF NOT EXISTS "copilot_actions" (
  "id" text PRIMARY KEY NOT NULL,
  "suggestion_id" text NOT NULL REFERENCES "copilot_suggestions"("id") ON DELETE CASCADE,
  "action_type" text NOT NULL,
  "target_type" text,
  "target_id" text,
  "payload" jsonb NOT NULL DEFAULT '{}',
  "status" text NOT NULL DEFAULT 'PENDENTE',
  "approved_by_id" text REFERENCES "users"("id"),
  "executed_at" timestamp,
  "error_message" text,
  "result_summary" text,
  "result_ref" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "copilot_actions_suggestion_idx" ON "copilot_actions" ("suggestion_id","status");
