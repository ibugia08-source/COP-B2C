CREATE TABLE "user_dashboard_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"visible_metrics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metric_order" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"layout_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"default_filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"visible_alerts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "user_dashboard_configs_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "user_dashboard_configs" ADD CONSTRAINT "user_dashboard_configs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;