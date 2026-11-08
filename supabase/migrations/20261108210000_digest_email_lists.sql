-- Digest email lists. One subscription per address now carries a switch per
-- list: the Daily Digest (on for every existing subscriber, so nothing changes
-- for them) and the weekly Week in Review (off until someone opts in).
-- unsubscribed_at still stops every email; turning both lists off sets it.
ALTER TABLE "public"."digest_email_subscriptions"
  ADD COLUMN IF NOT EXISTS "daily_enabled" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "weekly_enabled" boolean NOT NULL DEFAULT false;

-- One row per (weekly edition, subscription) delivery so a re-run of the
-- weekly send cron never emails the same week to the same address twice.
CREATE TABLE IF NOT EXISTS "public"."digest_weekly_email_sends" (
    "edition_id" uuid NOT NULL REFERENCES "public"."digest_weekly_editions"("id") ON DELETE CASCADE,
    "subscription_id" uuid NOT NULL REFERENCES "public"."digest_email_subscriptions"("id") ON DELETE CASCADE,
    "message_id" text,
    "sent_at" timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY ("edition_id", "subscription_id")
);
ALTER TABLE "public"."digest_weekly_email_sends" OWNER TO "postgres";

CREATE INDEX IF NOT EXISTS "digest_email_subscriptions_weekly_idx"
  ON "public"."digest_email_subscriptions" ("created_at", "id")
  WHERE "weekly_enabled" AND "unsubscribed_at" IS NULL;

-- Service-role only, like the other email tables.
ALTER TABLE "public"."digest_weekly_email_sends" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "public"."digest_weekly_email_sends" FROM "anon", "authenticated";
GRANT ALL PRIVILEGES ON TABLE "public"."digest_weekly_email_sends" TO "service_role";
