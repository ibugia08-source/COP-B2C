CREATE TABLE `activity_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`metadata` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `activity_logs_entity_idx` ON `activity_logs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `activity_logs_user_idx` ON `activity_logs` (`user_id`);--> statement-breakpoint
CREATE INDEX `activity_logs_created_idx` ON `activity_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `automation_execution_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_id` text NOT NULL,
	`status` text NOT NULL,
	`payload` text,
	`error` text,
	`detail` text,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`rule_id`) REFERENCES `automation_rules`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `automation_exec_rule_idx` ON `automation_execution_logs` (`rule_id`);--> statement-breakpoint
CREATE TABLE `automation_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`trigger_type` text NOT NULL,
	`conditions` text,
	`actions` text,
	`enabled` integer DEFAULT true NOT NULL,
	`scope` text DEFAULT 'GLOBAL' NOT NULL,
	`created_by_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `client_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`name` text NOT NULL,
	`role` text,
	`phone` text,
	`email` text,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `client_contacts_client_idx` ON `client_contacts` (`client_id`);--> statement-breakpoint
CREATE TABLE `client_health_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`previous_status` text,
	`new_status` text NOT NULL,
	`reason` text,
	`changed_by_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`changed_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `client_health_logs_client_idx` ON `client_health_logs` (`client_id`);--> statement-breakpoint
CREATE TABLE `client_meetings` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`title` text NOT NULL,
	`meeting_date` integer NOT NULL,
	`summary` text,
	`created_by_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `client_meetings_client_idx` ON `client_meetings` (`client_id`);--> statement-breakpoint
CREATE TABLE `client_operational_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`platforms` text DEFAULT '[]' NOT NULL,
	`average_daily_budget` real,
	`campaign_objective` text,
	`campaign_types` text DEFAULT '[]' NOT NULL,
	`offer_description` text,
	`funnel_notes` text,
	`service_rules` text,
	`monthly_meeting_required` integer DEFAULT false NOT NULL,
	`briefing_text` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `client_operational_profiles_client_id_unique` ON `client_operational_profiles` (`client_id`);--> statement-breakpoint
CREATE TABLE `client_pipeline_stages` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`name` text NOT NULL,
	`order` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'PENDENTE' NOT NULL,
	`completed_at` integer,
	`completed_by_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`completed_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `client_pipeline_stages_client_idx` ON `client_pipeline_stages` (`client_id`);--> statement-breakpoint
CREATE TABLE `clients` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`legal_name` text,
	`brand_name` text,
	`agency_brand` text DEFAULT 'B2C_GESTAO' NOT NULL,
	`business_model` text DEFAULT 'OUTROS' NOT NULL,
	`niche` text,
	`city` text,
	`state` text,
	`instagram_url` text,
	`website_url` text,
	`decision_maker_name` text,
	`decision_maker_phone` text,
	`decision_maker_email` text,
	`status` text DEFAULT 'LEAD' NOT NULL,
	`health_status` text DEFAULT 'ESTAVEL' NOT NULL,
	`ads_status` text DEFAULT 'SEM_CAMPANHA' NOT NULL,
	`pipeline_stage` text DEFAULT 'NOVO_CLIENTE' NOT NULL,
	`strategist_id` text,
	`traffic_manager_1_id` text,
	`traffic_manager_2_id` text,
	`main_responsible_id` text,
	`start_date` integer,
	`churn_date` integer,
	`churn_reason` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`strategist_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`traffic_manager_1_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`traffic_manager_2_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`main_responsible_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `clients_status_idx` ON `clients` (`status`);--> statement-breakpoint
CREATE INDEX `clients_health_idx` ON `clients` (`health_status`);--> statement-breakpoint
CREATE INDEX `clients_brand_idx` ON `clients` (`agency_brand`);--> statement-breakpoint
CREATE INDEX `clients_niche_idx` ON `clients` (`niche`);--> statement-breakpoint
CREATE INDEX `clients_strategist_idx` ON `clients` (`strategist_id`);--> statement-breakpoint
CREATE INDEX `clients_tm1_idx` ON `clients` (`traffic_manager_1_id`);--> statement-breakpoint
CREATE INDEX `clients_tm2_idx` ON `clients` (`traffic_manager_2_id`);--> statement-breakpoint
CREATE INDEX `clients_responsible_idx` ON `clients` (`main_responsible_id`);--> statement-breakpoint
CREATE INDEX `clients_pipeline_idx` ON `clients` (`pipeline_stage`);--> statement-breakpoint
CREATE TABLE `creative_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`title` text NOT NULL,
	`briefing` text,
	`objective` text,
	`platform` text,
	`creative_type` text,
	`status` text DEFAULT 'SOLICITADO' NOT NULL,
	`requested_by_id` text,
	`copy_responsible_id` text,
	`assigned_to_id` text,
	`due_date` integer,
	`delivered_at` integer,
	`approved_at` integer,
	`file_links` text,
	`published_link` text,
	`offer` text,
	`cta` text,
	`observations` text,
	`client_feedback` text,
	`rejection_reason` text,
	`task_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requested_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`copy_responsible_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_to_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `creative_requests_client_idx` ON `creative_requests` (`client_id`);--> statement-breakpoint
CREATE INDEX `creative_requests_status_idx` ON `creative_requests` (`status`);--> statement-breakpoint
CREATE INDEX `creative_requests_assigned_idx` ON `creative_requests` (`assigned_to_id`);--> statement-breakpoint
CREATE TABLE `digital_asset_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`file_name` text NOT NULL,
	`file_type` text,
	`file_size` integer,
	`storage_path` text NOT NULL,
	`uploaded_by_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `digital_assets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `asset_attachments_asset_idx` ON `digital_asset_attachments` (`asset_id`);--> statement-breakpoint
CREATE TABLE `digital_asset_audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text,
	`user_id` text,
	`action` text NOT NULL,
	`metadata` text,
	`ip_address` text,
	`user_agent` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `digital_assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `asset_audit_asset_idx` ON `digital_asset_audit_logs` (`asset_id`);--> statement-breakpoint
CREATE INDEX `asset_audit_action_idx` ON `digital_asset_audit_logs` (`action`);--> statement-breakpoint
CREATE INDEX `asset_audit_created_idx` ON `digital_asset_audit_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `digital_asset_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`author_id` text,
	`content` text NOT NULL,
	`type` text DEFAULT 'COMENTARIO' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `digital_assets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `asset_comments_asset_idx` ON `digital_asset_comments` (`asset_id`);--> statement-breakpoint
CREATE TABLE `digital_asset_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`type` text DEFAULT 'CLIENTE' NOT NULL,
	`client_id` text,
	`status` text DEFAULT 'ATIVO' NOT NULL,
	`order` integer DEFAULT 0 NOT NULL,
	`created_by_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `asset_groups_client_idx` ON `digital_asset_groups` (`client_id`);--> statement-breakpoint
CREATE INDEX `asset_groups_status_idx` ON `digital_asset_groups` (`status`);--> statement-breakpoint
CREATE TABLE `digital_asset_secrets` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`secret_type` text DEFAULT 'PASSWORD' NOT NULL,
	`label` text NOT NULL,
	`encrypted_value` text NOT NULL,
	`masked_preview` text NOT NULL,
	`created_by_id` text,
	`updated_by_id` text,
	`last_revealed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `digital_assets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `asset_secrets_asset_idx` ON `digital_asset_secrets` (`asset_id`);--> statement-breakpoint
CREATE TABLE `digital_asset_status_history` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`old_status` text,
	`new_status` text NOT NULL,
	`reason` text,
	`changed_by_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `digital_assets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`changed_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `asset_status_history_asset_idx` ON `digital_asset_status_history` (`asset_id`);--> statement-breakpoint
CREATE TABLE `digital_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`client_id` text,
	`title` text NOT NULL,
	`description` text,
	`asset_type` text DEFAULT 'OTHER' NOT NULL,
	`platform` text DEFAULT 'OUTRA' NOT NULL,
	`status` text DEFAULT 'NAO_INFORMADO' NOT NULL,
	`priority` text DEFAULT 'MEDIA' NOT NULL,
	`owner_user_id` text,
	`assigned_to_id` text,
	`login_url` text,
	`profile_url` text,
	`business_manager_id` text,
	`ad_account_id` text,
	`page_id` text,
	`profile_id` text,
	`external_id` text,
	`recovery_email` text,
	`notes` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`last_checked_at` integer,
	`next_review_at` integer,
	`created_by_id` text,
	`updated_by_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`archived_at` integer,
	FOREIGN KEY (`group_id`) REFERENCES `digital_asset_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_to_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `assets_group_idx` ON `digital_assets` (`group_id`);--> statement-breakpoint
CREATE INDEX `assets_client_idx` ON `digital_assets` (`client_id`);--> statement-breakpoint
CREATE INDEX `assets_type_idx` ON `digital_assets` (`asset_type`);--> statement-breakpoint
CREATE INDEX `assets_platform_idx` ON `digital_assets` (`platform`);--> statement-breakpoint
CREATE INDEX `assets_status_idx` ON `digital_assets` (`status`);--> statement-breakpoint
CREATE INDEX `assets_assigned_idx` ON `digital_assets` (`assigned_to_id`);--> statement-breakpoint
CREATE INDEX `assets_review_idx` ON `digital_assets` (`next_review_at`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`content` text,
	`type` text DEFAULT 'WIKI' NOT NULL,
	`category` text,
	`client_id` text,
	`task_id` text,
	`is_archived` integer DEFAULT false NOT NULL,
	`visible_to_roles` text DEFAULT '[]' NOT NULL,
	`created_by_id` text,
	`updated_by_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `documents_client_idx` ON `documents` (`client_id`);--> statement-breakpoint
CREATE INDEX `documents_type_idx` ON `documents` (`type`);--> statement-breakpoint
CREATE TABLE `form_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`client_id` text,
	`submitted_by_id` text,
	`data` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `form_templates`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`submitted_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `form_submissions_template_idx` ON `form_submissions` (`template_id`);--> statement-breakpoint
CREATE INDEX `form_submissions_client_idx` ON `form_submissions` (`client_id`);--> statement-breakpoint
CREATE TABLE `form_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`fields` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_by_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `form_templates_slug_unique` ON `form_templates` (`slug`);--> statement-breakpoint
CREATE TABLE `goal_targets` (
	`id` text PRIMARY KEY NOT NULL,
	`goal_id` text NOT NULL,
	`metric` text NOT NULL,
	`unit` text,
	`target_value` real NOT NULL,
	`current_value` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `goal_targets_goal_idx` ON `goal_targets` (`goal_id`);--> statement-breakpoint
CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`scope` text DEFAULT 'AGENCIA' NOT NULL,
	`category` text DEFAULT 'OPERACIONAL' NOT NULL,
	`owner_id` text,
	`client_id` text,
	`status` text DEFAULT 'PLANEJADA' NOT NULL,
	`target_value` real DEFAULT 0 NOT NULL,
	`super_target_value` real,
	`mega_target_value` real,
	`current_value` real DEFAULT 0 NOT NULL,
	`unit` text,
	`auto_progress` integer DEFAULT false NOT NULL,
	`period_start` integer,
	`period_end` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `import_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text DEFAULT 'CLICKUP' NOT NULL,
	`file_name` text,
	`entity` text NOT NULL,
	`total_rows` integer DEFAULT 0 NOT NULL,
	`imported_rows` integer DEFAULT 0 NOT NULL,
	`skipped_rows` integer DEFAULT 0 NOT NULL,
	`error_rows` integer DEFAULT 0 NOT NULL,
	`report` text,
	`created_by_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text DEFAULT 'INFO' NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`entity_type` text,
	`entity_id` text,
	`read_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notifications_user_idx` ON `notifications` (`user_id`,`read_at`);--> statement-breakpoint
CREATE TABLE `permissions` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`description` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `permissions_key_unique` ON `permissions` (`key`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`client_id` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `projects_client_idx` ON `projects` (`client_id`);--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`role_id` text NOT NULL,
	`permission_id` text NOT NULL,
	PRIMARY KEY(`role_id`, `permission_id`),
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roles_name_unique` ON `roles` (`name`);--> statement-breakpoint
CREATE TABLE `task_assignees` (
	`task_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`task_id`, `user_id`),
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `task_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`file_name` text NOT NULL,
	`file_url` text NOT NULL,
	`mime_type` text,
	`size_bytes` integer,
	`uploaded_by_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `task_attachments_task_idx` ON `task_attachments` (`task_id`);--> statement-breakpoint
CREATE TABLE `task_checklist_items` (
	`id` text PRIMARY KEY NOT NULL,
	`checklist_id` text NOT NULL,
	`content` text NOT NULL,
	`is_done` integer DEFAULT false NOT NULL,
	`order` integer DEFAULT 0 NOT NULL,
	`completed_by_id` text,
	`completed_at` integer,
	FOREIGN KEY (`checklist_id`) REFERENCES `task_checklists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`completed_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `task_checklist_items_checklist_idx` ON `task_checklist_items` (`checklist_id`);--> statement-breakpoint
CREATE TABLE `task_checklists` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`title` text NOT NULL,
	`order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `task_checklists_task_idx` ON `task_checklists` (`task_id`);--> statement-breakpoint
CREATE TABLE `task_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`author_id` text,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `task_comments_task_idx` ON `task_comments` (`task_id`);--> statement-breakpoint
CREATE TABLE `task_dependencies` (
	`task_id` text NOT NULL,
	`depends_on_task_id` text NOT NULL,
	PRIMARY KEY(`task_id`, `depends_on_task_id`),
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`depends_on_task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `task_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`task_type` text DEFAULT 'OPERACIONAL' NOT NULL,
	`pipeline_stage` text,
	`items` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_by_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_templates_slug_unique` ON `task_templates` (`slug`);--> statement-breakpoint
CREATE TABLE `task_time_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`user_id` text,
	`minutes` integer NOT NULL,
	`description` text,
	`date` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `task_time_entries_task_idx` ON `task_time_entries` (`task_id`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`type` text DEFAULT 'OPERACIONAL' NOT NULL,
	`status` text DEFAULT 'A_FAZER' NOT NULL,
	`priority` text DEFAULT 'MEDIA' NOT NULL,
	`client_id` text,
	`project_id` text,
	`parent_task_id` text,
	`digital_asset_id` text,
	`assigned_to_id` text,
	`created_by_id` text,
	`cancel_reason` text,
	`due_date` integer,
	`start_date` integer,
	`completed_at` integer,
	`estimated_minutes` integer,
	`tracked_minutes` integer DEFAULT 0 NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`assigned_to_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tasks_status_idx` ON `tasks` (`status`);--> statement-breakpoint
CREATE INDEX `tasks_type_idx` ON `tasks` (`type`);--> statement-breakpoint
CREATE INDEX `tasks_client_idx` ON `tasks` (`client_id`);--> statement-breakpoint
CREATE INDEX `tasks_assigned_idx` ON `tasks` (`assigned_to_id`);--> statement-breakpoint
CREATE INDEX `tasks_due_idx` ON `tasks` (`due_date`);--> statement-breakpoint
CREATE INDEX `tasks_parent_idx` ON `tasks` (`parent_task_id`);--> statement-breakpoint
CREATE INDEX `tasks_asset_idx` ON `tasks` (`digital_asset_id`);--> statement-breakpoint
CREATE TABLE `team_members` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`phone` text,
	`position` text,
	`status` text DEFAULT 'ATIVO' NOT NULL,
	`hired_at` integer,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_members_user_id_unique` ON `team_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `user_roles` (
	`user_id` text NOT NULL,
	`role_id` text NOT NULL,
	PRIMARY KEY(`user_id`, `role_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`status` text DEFAULT 'ATIVO' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`signup_source` text DEFAULT 'ADMIN' NOT NULL,
	`approved_by_id` text,
	`approved_at` integer,
	`avatar_url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_idx` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `users_status_idx` ON `users` (`status`);