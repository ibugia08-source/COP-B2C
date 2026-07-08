ALTER TABLE "agency_services" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "agency_services" ADD COLUMN "color" text;--> statement-breakpoint
ALTER TABLE "client_meetings" ADD COLUMN "meeting_type" text DEFAULT 'ACOMPANHAMENTO' NOT NULL;--> statement-breakpoint
ALTER TABLE "client_meetings" ADD COLUMN "status" text DEFAULT 'AGENDADA' NOT NULL;--> statement-breakpoint
ALTER TABLE "client_meetings" ADD COLUMN "participants" text;--> statement-breakpoint
ALTER TABLE "client_meetings" ADD COLUMN "responsible_id" text;--> statement-breakpoint
ALTER TABLE "client_meetings" ADD COLUMN "meet_link" text;--> statement-breakpoint
ALTER TABLE "client_meetings" ADD COLUMN "next_steps" text;--> statement-breakpoint
ALTER TABLE "client_meetings" ADD COLUMN "updated_at" timestamp NOT NULL;--> statement-breakpoint
ALTER TABLE "client_meetings" ADD CONSTRAINT "client_meetings_responsible_id_users_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;