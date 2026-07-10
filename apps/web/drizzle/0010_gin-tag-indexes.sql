CREATE INDEX "assets_tags_gin_idx" ON "digital_assets" USING gin ("tags" jsonb_path_ops);--> statement-breakpoint
CREATE INDEX "tasks_tags_gin_idx" ON "tasks" USING gin ("tags" jsonb_path_ops);