-- The Daily Digest email moved from double to single opt-in: subscribing now
-- stamps confirmed_at immediately and the confirmation link no longer exists.
-- Activate any row that was still waiting on the old confirmation email.
UPDATE "public"."digest_email_subscriptions"
SET "confirmed_at" = "created_at"
WHERE "confirmed_at" IS NULL
  AND "unsubscribed_at" IS NULL;
