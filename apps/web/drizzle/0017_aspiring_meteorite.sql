ALTER TABLE "digital_assets" ALTER COLUMN "next_review_at" SET DATA TYPE date USING "next_review_at"::date;--> statement-breakpoint
ALTER TABLE "goals" ALTER COLUMN "period_start" SET DATA TYPE date USING "period_start"::date;--> statement-breakpoint
ALTER TABLE "goals" ALTER COLUMN "period_end" SET DATA TYPE date USING "period_end"::date;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "due_date" SET DATA TYPE date USING "due_date"::date;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "start_date" SET DATA TYPE date USING "start_date"::date;