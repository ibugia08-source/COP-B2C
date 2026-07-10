CREATE TABLE "login_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"ip_address" text,
	"success" boolean DEFAULT false NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX "login_attempts_email_idx" ON "login_attempts" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "login_attempts_ip_idx" ON "login_attempts" USING btree ("ip_address","created_at");