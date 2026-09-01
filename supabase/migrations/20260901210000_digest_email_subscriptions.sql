-- Daily Digest email subscriptions. Consent is explicit: a row exists only
-- after someone submits their address, sends happen only after confirmed_at
-- is set (double opt-in), and unsubscribed_at permanently wins over both.
-- Service-role only; tokens are the sole credential in confirm/unsubscribe
-- links, so rows must never be readable by anon or authenticated clients.
CREATE TABLE IF NOT EXISTS "public"."digest_email_subscriptions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "email" text NOT NULL,
    -- Trusted Twitter provider id captured when the subscriber was signed in,
    -- so settings can show and manage the subscription. Nullable: guests
    -- subscribe with just an email.
    "account_id" text,
    "token" uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    "confirmed_at" timestamptz,
    "unsubscribed_at" timestamptz,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "updated_at" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "digest_email_subscriptions_email_length" CHECK (char_length(email) BETWEEN 3 AND 320),
    CONSTRAINT "digest_email_subscriptions_email_format" CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$')
);
ALTER TABLE "public"."digest_email_subscriptions" OWNER TO "postgres";

-- One row per (edition, subscription) delivery so a re-run of the send cron
-- can never email the same edition to the same address twice.
CREATE TABLE IF NOT EXISTS "public"."digest_email_sends" (
    "edition_id" uuid NOT NULL REFERENCES "public"."digest_editions"("id") ON DELETE CASCADE,
    "subscription_id" uuid NOT NULL REFERENCES "public"."digest_email_subscriptions"("id") ON DELETE CASCADE,
    "message_id" text,
    "sent_at" timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY ("edition_id", "subscription_id")
);
ALTER TABLE "public"."digest_email_sends" OWNER TO "postgres";

-- One subscription per address, case-insensitively.
CREATE UNIQUE INDEX IF NOT EXISTS "digest_email_subscriptions_email_key"
  ON "public"."digest_email_subscriptions" (lower("email"));

CREATE INDEX IF NOT EXISTS "digest_email_subscriptions_account_idx"
  ON "public"."digest_email_subscriptions" ("account_id")
  WHERE "account_id" IS NOT NULL;

-- No policies on the email tables: service-role only.
ALTER TABLE "public"."digest_email_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."digest_email_sends" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE "public"."digest_email_subscriptions" FROM "anon", "authenticated";
REVOKE ALL PRIVILEGES ON TABLE "public"."digest_email_sends" FROM "anon", "authenticated";
GRANT ALL PRIVILEGES ON TABLE "public"."digest_email_subscriptions" TO "service_role";
GRANT ALL PRIVILEGES ON TABLE "public"."digest_email_sends" TO "service_role";

CREATE OR REPLACE TRIGGER "update_digest_email_subscriptions_updated_at" BEFORE UPDATE ON "public"."digest_email_subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();
