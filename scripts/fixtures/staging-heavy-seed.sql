-- Optional staging stress-test fixtures.
--
-- Keep this file outside supabase/ so Supabase preview branching cannot
-- discover or upload it. Staging bootstrap/sync scripts apply it explicitly,
-- and production deployment ignores files under scripts/.

SET session_replication_role = replica;
SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- Bulky test account for verifying the inline export+delete path. It remains
-- below the 10k inline ceiling so the operation should complete end to end.
INSERT INTO "public"."all_account" ("account_id", "created_via", "username", "created_at", "account_display_name", "num_tweets", "num_following", "num_followers", "num_likes")
VALUES
  ('mock_bulky', 'web', 'bulky_test', '2018-01-01T00:00:00Z', 'Bulky Test Account', 5000, 0, 0, 0)
ON CONFLICT ("account_id") DO NOTHING;

INSERT INTO "public"."archive_upload" ("id", "account_id", "archive_at", "created_at", "upload_phase") OVERRIDING SYSTEM VALUE
VALUES
  (200, 'mock_bulky', '2024-12-01T00:00:00Z', '2024-12-01T00:00:00Z', 'completed')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "public"."all_profile" ("account_id", "bio", "website", "location", "avatar_media_url", "header_media_url", "archive_upload_id")
VALUES
  ('mock_bulky', 'Synthetic test account for admin delete flow', NULL, NULL, 'https://api.dicebear.com/7.x/avataaars/svg?seed=bulky_test', NULL, 200)
ON CONFLICT ("account_id") DO NOTHING;

INSERT INTO "public"."tweets" ("tweet_id", "account_id", "created_at", "full_text", "retweet_count", "favorite_count", "reply_to_tweet_id", "reply_to_user_id", "reply_to_username", "archive_upload_id")
SELECT
  't_bulky_' || lpad(i::text, 5, '0'),
  'mock_bulky',
  '2024-01-01T00:00:00Z'::timestamptz + (i || ' minutes')::interval,
  'Synthetic tweet ' || i || ' for testing the admin export + delete flow.',
  0,
  0,
  NULL,
  NULL,
  NULL,
  200
FROM generate_series(1, 5000) AS i
ON CONFLICT ("tweet_id") DO NOTHING;

-- Giant test account: 100,000 tweets — above the 10k inline ceiling so
-- the "Opt out and delete data" dialog should show the warning and likely hit
-- the Vercel function timeout when exercised. This verifies that the export
-- fails visibly instead of silently truncating.
INSERT INTO "public"."all_account" ("account_id", "created_via", "username", "created_at", "account_display_name", "num_tweets", "num_following", "num_followers", "num_likes")
VALUES
  ('mock_giant', 'web', 'giant_test', '2015-01-01T00:00:00Z', 'Giant Test Account', 100000, 0, 0, 0)
ON CONFLICT ("account_id") DO NOTHING;

INSERT INTO "public"."archive_upload" ("id", "account_id", "archive_at", "created_at", "upload_phase") OVERRIDING SYSTEM VALUE
VALUES
  (201, 'mock_giant', '2024-12-01T00:00:00Z', '2024-12-01T00:00:00Z', 'completed')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "public"."all_profile" ("account_id", "bio", "website", "location", "avatar_media_url", "header_media_url", "archive_upload_id")
VALUES
  ('mock_giant', 'Synthetic 100k-tweet test account', NULL, NULL, 'https://api.dicebear.com/7.x/avataaars/svg?seed=giant_test', NULL, 201)
ON CONFLICT ("account_id") DO NOTHING;

INSERT INTO "public"."tweets" ("tweet_id", "account_id", "created_at", "full_text", "retweet_count", "favorite_count", "reply_to_tweet_id", "reply_to_user_id", "reply_to_username", "archive_upload_id")
SELECT
  't_giant_' || lpad(i::text, 6, '0'),
  'mock_giant',
  '2018-01-01T00:00:00Z'::timestamptz + (i || ' minutes')::interval,
  'Synthetic giant-account tweet ' || i || ' for testing the inline export ceiling.',
  0,
  0,
  NULL,
  NULL,
  NULL,
  201
FROM generate_series(1, 100000) AS i
ON CONFLICT ("tweet_id") DO NOTHING;

SET session_replication_role = DEFAULT;
