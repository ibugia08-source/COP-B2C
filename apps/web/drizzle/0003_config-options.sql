CREATE TABLE "config_option_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"module_key" text NOT NULL,
	"group_key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "config_options" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"label" text NOT NULL,
	"value" text NOT NULL,
	"color" text,
	"order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "config_options" ADD CONSTRAINT "config_options_group_id_config_option_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."config_option_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "config_group_module_key_idx" ON "config_option_groups" USING btree ("module_key","group_key");--> statement-breakpoint
CREATE INDEX "config_options_group_idx" ON "config_options" USING btree ("group_id");