CREATE TABLE "permission_audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text,
	"target_user_id" text,
	"action" text NOT NULL,
	"permission" text,
	"cargo_before" text,
	"cargo_after" text,
	"metadata" jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_permissions" (
	"user_id" text NOT NULL,
	"permission" text NOT NULL,
	"granted_by_id" text,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "user_permissions_user_id_permission_pk" PRIMARY KEY("user_id","permission")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "cargo" text;--> statement-breakpoint
ALTER TABLE "permission_audit_logs" ADD CONSTRAINT "permission_audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_audit_logs" ADD CONSTRAINT "permission_audit_logs_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_granted_by_id_users_id_fk" FOREIGN KEY ("granted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "perm_audit_target_idx" ON "permission_audit_logs" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "perm_audit_actor_idx" ON "permission_audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "perm_audit_created_idx" ON "permission_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "user_permissions_user_idx" ON "user_permissions" USING btree ("user_id");