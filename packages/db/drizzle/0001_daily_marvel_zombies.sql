CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
-- The scaffold has no line-item/customer history to reconstruct. Never invent it.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM orders) THEN
    RAISE EXCEPTION 'Existing scaffold orders require a reviewed customer/item backfill before migrating';
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE "idempotency_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"creator_id" integer NOT NULL,
	"key" text NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_requests_creator_key_unique" UNIQUE("creator_id","key"),
	CONSTRAINT "idempotency_requests_key_check" CHECK ("idempotency_requests"."key" ~ '^[!-~]{1,128}$'),
	CONSTRAINT "idempotency_requests_response_check" CHECK (("idempotency_requests"."response_status" is null and "idempotency_requests"."response_body" is null) or ("idempotency_requests"."response_status" between 200 and 299 and "idempotency_requests"."response_body" is not null))
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"position" integer NOT NULL,
	"description" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_cents" integer NOT NULL,
	CONSTRAINT "order_items_order_position_unique" UNIQUE("order_id","position"),
	CONSTRAINT "order_items_position_check" CHECK ("order_items"."position" between 0 and 4),
	CONSTRAINT "order_items_description_check" CHECK ("order_items"."description" = btrim("order_items"."description") and char_length("order_items"."description") between 1 and 200),
	CONSTRAINT "order_items_quantity_check" CHECK ("order_items"."quantity" between 1 and 999),
	CONSTRAINT "order_items_price_check" CHECK ("order_items"."unit_price_cents" between 1 and 10000000)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" RENAME COLUMN "user_id" TO "creator_id";--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_user_id_users_id_fk";
--> statement-breakpoint
-- Existing naive timestamps represent UTC, regardless of the connection timezone.
ALTER TABLE "orders" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_email" text NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" text DEFAULT 'agent' NOT NULL;--> statement-breakpoint
ALTER TABLE "idempotency_requests" ADD CONSTRAINT "idempotency_requests_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_user_expires_idx" ON "sessions" USING btree ("user_id","expires_at");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_created_at_id_idx" ON "orders" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "orders_total_cents_id_idx" ON "orders" USING btree ("total_cents","id");--> statement-breakpoint
CREATE INDEX "orders_status_created_at_id_idx" ON "orders" USING btree ("status","created_at","id");--> statement-breakpoint
CREATE INDEX "orders_status_total_cents_id_idx" ON "orders" USING btree ("status","total_cents","id");--> statement-breakpoint
CREATE INDEX "orders_customer_name_trgm_idx" ON "orders" USING gin ("customer_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "orders_customer_email_trgm_idx" ON "orders" USING gin ("customer_email" gin_trgm_ops);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_status_check" CHECK ("orders"."status" in ('pending', 'processing', 'completed', 'cancelled'));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_total_check" CHECK ("orders"."total_cents" between 1 and 2000000000);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_name_check" CHECK ("orders"."customer_name" = btrim("orders"."customer_name") and char_length("orders"."customer_name") between 1 and 100);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_email_check" CHECK ("orders"."customer_email" = lower(btrim("orders"."customer_email")) and char_length("orders"."customer_email") between 3 and 254);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK ("users"."role" in ('admin', 'agent'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_check" CHECK ("users"."email" = lower(btrim("users"."email")) and char_length("users"."email") between 3 and 254);
