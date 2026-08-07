CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"template_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"status" text DEFAULT 'Draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" uuid NOT NULL,
	"field_id" uuid NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	CONSTRAINT "sections_note_id_field_id_unique" UNIQUE("note_id","field_id")
);
--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_owner_id_accounts_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_field_id_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."fields"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notes_owner_idx" ON "notes" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "notes_template_idx" ON "notes" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "notes_updated_at_idx" ON "notes" USING btree ("updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sections_note_idx" ON "sections" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "sections_field_idx" ON "sections" USING btree ("field_id");