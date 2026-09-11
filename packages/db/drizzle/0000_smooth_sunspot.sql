CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('man', 'woman', 'non_binary');--> statement-breakpoint
CREATE TYPE "public"."setup_status" AS ENUM('interest_pending', 'mutual', 'proposed', 'countered', 'confirmed', 'declined', 'expired');--> statement-breakpoint
CREATE TABLE "admin_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"profile_id" uuid,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"age" integer NOT NULL,
	"gender" "gender" NOT NULL,
	"interested_in" "gender"[] NOT NULL,
	"city" text NOT NULL,
	"country" text NOT NULL,
	"radius_km" integer DEFAULT 25 NOT NULL,
	"availability" text NOT NULL,
	"brief" text NOT NULL,
	"embedding" vector(1536),
	"first_name" text NOT NULL,
	"phone" text NOT NULL,
	"photo_url" text,
	"email" text,
	"standing_instructions" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "setups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_a_id" uuid NOT NULL,
	"profile_b_id" uuid NOT NULL,
	"status" "setup_status" DEFAULT 'interest_pending' NOT NULL,
	"interested_a_at" timestamp with time zone,
	"interested_b_at" timestamp with time zone,
	"proposal" jsonb,
	"counter" jsonb,
	"confirmed_slot" timestamp with time zone,
	"confirmed_a" boolean DEFAULT false NOT NULL,
	"confirmed_b" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "setups_pair_key" UNIQUE("profile_a_id","profile_b_id"),
	CONSTRAINT "setups_ordered_pair" CHECK ("setups"."profile_a_id" < "setups"."profile_b_id")
);
--> statement-breakpoint
ALTER TABLE "setups" ADD CONSTRAINT "setups_profile_a_id_profiles_id_fk" FOREIGN KEY ("profile_a_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setups" ADD CONSTRAINT "setups_profile_b_id_profiles_id_fk" FOREIGN KEY ("profile_b_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_events_kind_idx" ON "admin_events" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "admin_events_created_at_idx" ON "admin_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "admin_events_profile_id_idx" ON "admin_events" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "profiles_embedding_idx" ON "profiles" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "profiles_last_seen_at_idx" ON "profiles" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "profiles_location_idx" ON "profiles" USING btree ("country","city");--> statement-breakpoint
CREATE INDEX "setups_profile_a_id_idx" ON "setups" USING btree ("profile_a_id");--> statement-breakpoint
CREATE INDEX "setups_profile_b_id_idx" ON "setups" USING btree ("profile_b_id");--> statement-breakpoint
CREATE INDEX "setups_status_idx" ON "setups" USING btree ("status");