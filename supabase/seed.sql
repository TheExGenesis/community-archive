SET session_replication_role = replica;

--
-- Mock seed data for local development
-- session_replication_role = replica disables FK checks during seeding
--

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

-- Accounts
INSERT INTO "public"."all_account" ("account_id", "created_via", "username", "created_at", "account_display_name", "num_tweets", "num_following", "num_followers", "num_likes")
VALUES
  ('mock_alice',  'web', 'alice_dev',   '2019-03-15T10:00:00Z', 'Alice Developer', 5, 3, 5, 1),
  ('mock_bob',    'web', 'bob_writes',  '2020-06-01T12:00:00Z', 'Bob Writes',      2, 1, 2, 0),
  ('mock_carol',  'web', 'carol_ml',    '2018-11-20T08:00:00Z', 'Carol ML',        2, 3, 2, 0),
  ('mock_dave',   'web', 'dave_design', '2021-01-10T14:00:00Z', 'Dave Design',     1, 2, 1, 0),
  ('mock_eve',    'web', 'eve_data',    '2020-09-05T16:00:00Z', 'Eve Data',        2, 1, 1, 0),
  ('mock_frank',  'web', 'frank_ops',   '2022-02-14T09:00:00Z', 'Frank Ops',       1, 2, 0, 0),
  ('mock_quoted', 'web', 'quoteduser',  '2017-05-01T00:00:00Z', 'Quoted User',     1, 0, 0, 0),
  ('mock_xiq',    'web', 'xiq_dev',     '2018-08-20T09:00:00Z', 'XIQ Dev',         3, 2, 3, 1);

-- Most mock accounts are opted in so staging/admin flows have realistic rows.
INSERT INTO "public"."optin" ("username", "twitter_user_id", "opted_in", "explicit_optout", "opt_out_reason", "terms_version", "created_at", "updated_at", "opted_in_at", "opted_out_at")
VALUES
  ('alice_dev',   'mock_alice', true, false, NULL, 'v1.0', '2024-12-02T08:00:00Z', '2024-12-02T08:00:00Z', '2024-12-02T08:00:00Z', NULL),
  ('bob_writes',  'mock_bob',   true, false, NULL, 'v1.0', '2024-12-02T08:05:00Z', '2024-12-02T08:05:00Z', '2024-12-02T08:05:00Z', NULL),
  ('carol_ml',    'mock_carol', true, false, NULL, 'v1.0', '2024-12-02T08:10:00Z', '2024-12-02T08:10:00Z', '2024-12-02T08:10:00Z', NULL),
  ('dave_design', 'mock_dave',  true, false, NULL, 'v1.0', '2024-12-02T08:15:00Z', '2024-12-02T08:15:00Z', '2024-12-02T08:15:00Z', NULL),
  ('eve_data',    'mock_eve',   true, false, NULL, 'v1.0', '2024-12-02T08:20:00Z', '2024-12-02T08:20:00Z', '2024-12-02T08:20:00Z', NULL),
  ('xiq_dev',     'mock_xiq',   true, false, NULL, 'v1.0', '2024-12-02T08:25:00Z', '2024-12-02T08:25:00Z', '2024-12-02T08:25:00Z', NULL)
ON CONFLICT ("username") DO UPDATE SET
  "twitter_user_id" = EXCLUDED."twitter_user_id",
  "opted_in" = EXCLUDED."opted_in",
  "explicit_optout" = EXCLUDED."explicit_optout",
  "opt_out_reason" = EXCLUDED."opt_out_reason",
  "terms_version" = EXCLUDED."terms_version",
  "updated_at" = EXCLUDED."updated_at",
  "opted_in_at" = EXCLUDED."opted_in_at",
  "opted_out_at" = EXCLUDED."opted_out_at";

-- Archive uploads (must be 'completed' for account/profile views to work)
INSERT INTO "public"."archive_upload" ("id", "account_id", "archive_at", "created_at", "upload_phase") OVERRIDING SYSTEM VALUE
VALUES
  (101, 'mock_alice',  '2024-12-01T00:00:00Z', '2024-12-01T00:00:00Z', 'completed'),
  (102, 'mock_bob',    '2024-12-01T00:00:00Z', '2024-12-01T00:00:00Z', 'completed'),
  (103, 'mock_carol',  '2024-12-01T00:00:00Z', '2024-12-01T00:00:00Z', 'completed'),
  (104, 'mock_dave',   '2024-12-01T00:00:00Z', '2024-12-01T00:00:00Z', 'completed'),
  (105, 'mock_eve',    '2024-12-01T00:00:00Z', '2024-12-01T00:00:00Z', 'completed'),
  (106, 'mock_frank',  '2024-12-01T00:00:00Z', '2024-12-01T00:00:00Z', 'completed'),
  (107, 'mock_quoted', '2024-12-01T00:00:00Z', '2024-12-01T00:00:00Z', 'completed'),
  (108, 'mock_xiq',    '2024-12-01T00:00:00Z', '2024-12-01T00:00:00Z', 'completed');

SELECT setval(pg_get_serial_sequence('public.archive_upload', 'id'), 200);

-- Profiles
INSERT INTO "public"."all_profile" ("account_id", "bio", "website", "location", "avatar_media_url", "header_media_url", "archive_upload_id")
VALUES
  ('mock_alice',  'Full-stack dev building cool stuff',  'https://alice.dev',     'San Francisco', 'https://api.dicebear.com/7.x/avataaars/svg?seed=alice_dev',   NULL, 101),
  ('mock_bob',    'Writer and thinker. Words matter.',   'https://bobwrites.com', 'New York',      'https://api.dicebear.com/7.x/avataaars/svg?seed=bob_writes',  NULL, 102),
  ('mock_carol',  'ML researcher at heart',              NULL,                    'London',        'https://api.dicebear.com/7.x/avataaars/svg?seed=carol_ml',    NULL, 103),
  ('mock_dave',   'Design systems enthusiast',           NULL,                    'Berlin',        'https://api.dicebear.com/7.x/avataaars/svg?seed=dave_design', NULL, 104),
  ('mock_eve',    'Data engineering all day',            'https://evedata.io',    'Tokyo',         'https://api.dicebear.com/7.x/avataaars/svg?seed=eve_data',    NULL, 105),
  ('mock_frank',  'DevOps and infrastructure',           NULL,                    'Austin',        'https://api.dicebear.com/7.x/avataaars/svg?seed=frank_ops',   NULL, 106),
  ('mock_quoted', 'Quotes and RTs',                      NULL,                    NULL,            'https://api.dicebear.com/7.x/avataaars/svg?seed=quoteduser',  NULL, 107),
  ('mock_xiq',    'Distributed systems & formal methods',NULL,                    'Lisbon',        'https://api.dicebear.com/7.x/avataaars/svg?seed=xiq_dev',     NULL, 108);

-- Tweets (with conversation threads)
INSERT INTO "public"."tweets" ("tweet_id", "account_id", "created_at", "full_text", "retweet_count", "favorite_count", "reply_to_tweet_id", "reply_to_user_id", "reply_to_username", "archive_upload_id")
VALUES
  -- Alice's thread about Postgres
  ('t_alice_1', 'mock_alice', '2024-11-01T10:00:00Z', 'Just discovered how powerful PostgreSQL functions are. You can replace dozens of API calls with a single RPC. Thread below...', 12, 45, NULL, NULL, NULL, 101),
  ('t_alice_2', 'mock_alice', '2024-11-01T10:05:00Z', 'Step 1: Write your function in plpgsql. It can return JSONB which means you can bundle multiple queries into one response.', 3, 20, 't_alice_1', 'mock_alice', 'alice_dev', 101),
  ('t_alice_3', 'mock_alice', '2024-11-01T10:10:00Z', 'Step 2: Mark it as STABLE and SECURITY INVOKER so PostgREST can cache it and RLS still applies. Game changer for performance.', 5, 30, 't_alice_2', 'mock_alice', 'alice_dev', 101),

  -- Bob replies to Alice
  ('t_bob_1', 'mock_bob', '2024-11-01T11:00:00Z', 'This is a great thread @alice_dev! We used this pattern to reduce our API costs by 90%.', 2, 15, 't_alice_3', 'mock_alice', 'alice_dev', 102),
  ('t_bob_2', 'mock_bob', '2024-11-01T14:00:00Z', 'Writing about the future of open source communities. There is something beautiful about shared archives of knowledge.', 8, 35, NULL, NULL, NULL, 102),

  -- Carol's ML tweets
  ('t_carol_1', 'mock_carol', '2024-11-02T09:00:00Z', 'New paper alert: Attention mechanisms can be simplified without losing performance. The key insight is that most heads are redundant.', 20, 80, NULL, NULL, NULL, 103),
  ('t_carol_2', 'mock_carol', '2024-11-02T15:00:00Z', 'Hot take: The best ML models are the ones you never have to retrain. Invest in good data pipelines, not bigger models.', 15, 60, NULL, NULL, NULL, 103),

  -- Dave on design
  ('t_dave_1', 'mock_dave', '2024-11-03T12:00:00Z', 'Design systems are not about consistency for its own sake. They are about giving teams a shared language to move faster.', 6, 25, NULL, NULL, NULL, 104),

  -- Eve's data engineering tweets
  ('t_eve_1', 'mock_eve', '2024-11-04T08:00:00Z', 'Just migrated our entire analytics pipeline from Spark to DuckDB. 10x faster, 100x cheaper. Sometimes simpler is better.', 25, 95, NULL, NULL, NULL, 105),
  ('t_eve_2', 'mock_eve', '2024-11-04T16:00:00Z', 'PSA: If your data pipeline has more than 5 steps, you probably have a design problem, not a tooling problem.', 10, 40, NULL, NULL, NULL, 105),

  -- Frank ops tweet
  ('t_frank_1', 'mock_frank', '2024-11-05T10:00:00Z', 'Deployed our new monitoring stack today. Grafana + Prometheus + custom alerting. Finally sleeping through the night.', 4, 18, NULL, NULL, NULL, 106),

  -- Quoted user
  ('t_quoted_1', 'mock_quoted', '2024-10-15T12:00:00Z', 'The best code is the code you never write. Reduce complexity before adding features.', 30, 120, NULL, NULL, NULL, 107),

  -- XIQ: standalone tweet (will be quoted by Alice)
  ('t_xiq_1',   'mock_xiq',   '2024-10-28T09:00:00Z', 'Most distributed systems bugs are actually unhandled partial failures pretending to be edge cases.', 18, 72, NULL, NULL, NULL, 108),
  -- XIQ joins Alice''s thread (reply to t_alice_3)
  ('t_xiq_2',   'mock_xiq',   '2024-11-01T12:30:00Z', 'Add to this: if your RPC returns JSONB, version the response shape from day one. Cheap insurance.', 4, 22, 't_alice_3', 'mock_alice', 'alice_dev', 108),
  -- Alice replies to XIQ in the same thread (and references xiq''s standalone tweet)
  ('t_alice_4', 'mock_alice', '2024-11-01T12:45:00Z', '@xiq_dev good call — we wrap responses in {data, version} and the client picks a parser by version.', 1, 9, 't_xiq_2', 'mock_xiq', 'xiq_dev', 101),
  -- Alice quotes XIQ''s standalone tweet (separate tweet, not in the thread)
  ('t_alice_5', 'mock_alice', '2024-10-28T19:30:00Z', 'This — write your retry logic before you write your happy path.', 6, 28, NULL, NULL, NULL, 101),
  -- XIQ replies to Bob''s reply in Alice''s thread (continues the conversation_id)
  ('t_xiq_3',   'mock_xiq',   '2024-11-02T08:00:00Z', '90%! Sharing the migration notes would be a gift to the rest of us @bob_writes.', 0, 6, 't_bob_1', 'mock_bob', 'bob_writes', 108);

-- Conversations (link tweets to conversation threads)
INSERT INTO "public"."conversations" ("conversation_id", "tweet_id")
VALUES
  -- Alice's thread is one conversation; xiq + alice continue it after bob's reply
  ('t_alice_1', 't_alice_1'),
  ('t_alice_1', 't_alice_2'),
  ('t_alice_1', 't_alice_3'),
  ('t_alice_1', 't_bob_1'),
  ('t_alice_1', 't_xiq_2'),
  ('t_alice_1', 't_alice_4'),
  ('t_alice_1', 't_xiq_3');

-- Tweet media
INSERT INTO "public"."tweet_media" ("media_id", "tweet_id", "media_url", "media_type", "width", "height", "archive_upload_id")
VALUES
  (1001, 't_carol_1', 'https://picsum.photos/seed/paper/800/400',    'photo', 800, 400, 103),
  (1002, 't_eve_1',   'https://picsum.photos/seed/pipeline/800/400', 'photo', 800, 400, 105),
  (1003, 't_dave_1',  'https://picsum.photos/seed/design/800/400',   'photo', 800, 400, 104);

-- Mentioned users
INSERT INTO "public"."mentioned_users" ("user_id", "name", "screen_name", "updated_at")
VALUES
  ('mu_alice', 'Alice Developer', 'alice_dev',  '2024-12-01T00:00:00Z'),
  ('mu_carol', 'Carol ML',        'carol_ml',   '2024-12-01T00:00:00Z'),
  ('mu_bob',   'Bob Writes',      'bob_writes', '2024-12-01T00:00:00Z'),
  ('mu_xiq',   'XIQ Dev',         'xiq_dev',    '2024-12-01T00:00:00Z')
ON CONFLICT ("user_id") DO NOTHING;

-- User mentions (who was mentioned in which tweet)
INSERT INTO "public"."user_mentions" ("id", "mentioned_user_id", "tweet_id") OVERRIDING SYSTEM VALUE
VALUES
  (2001, 'mu_alice', 't_bob_1'),
  (2002, 'mu_xiq',   't_alice_4'),
  (2003, 'mu_bob',   't_xiq_3');

SELECT setval(pg_get_serial_sequence('public.user_mentions', 'id'), 3000);

-- Quote tweets — Alice quotes XIQ; existing quote chain still here
INSERT INTO "public"."quote_tweets" ("tweet_id", "quoted_tweet_id")
VALUES
  ('t_eve_2',   't_quoted_1'),
  ('t_alice_5', 't_xiq_1');

-- Followers — also includes a few orphan rows with NULL archive_upload_id (simulating
-- scraper/browser-extension inserts) so the delete_user_archive orphan fix can be exercised.
INSERT INTO "public"."followers" ("id", "account_id", "follower_account_id", "archive_upload_id") OVERRIDING SYSTEM VALUE
VALUES
  (3001, 'mock_alice', 'mock_bob',    101),
  (3002, 'mock_alice', 'mock_carol',  101),
  (3003, 'mock_alice', 'mock_dave',   101),
  (3004, 'mock_alice', 'mock_eve',    101),
  (3005, 'mock_bob',   'mock_alice',  102),
  (3006, 'mock_bob',   'mock_carol',  102),
  (3007, 'mock_carol', 'mock_alice',  103),
  (3008, 'mock_carol', 'mock_dave',   103),
  (3009, 'mock_dave',  'mock_alice',  104),
  (3010, 'mock_eve',   'mock_frank',  105),
  -- XIQ <-> Alice mutual + xiq followed by carol
  (3011, 'mock_xiq',   'mock_alice',  108),
  (3012, 'mock_alice', 'mock_xiq',    101),
  (3013, 'mock_xiq',   'mock_carol',  108),
  -- Orphan follower rows (scraper-inserted, NULL archive_upload_id)
  (3014, 'mock_xiq',   'mock_eve',    NULL),
  (3015, 'mock_alice', 'mock_frank',  NULL);

SELECT setval(pg_get_serial_sequence('public.followers', 'id'), 4000);

-- Following — also includes orphan NULL archive_upload_id rows (scraper-inserted)
INSERT INTO "public"."following" ("id", "account_id", "following_account_id", "archive_upload_id") OVERRIDING SYSTEM VALUE
VALUES
  (5001, 'mock_alice',  'mock_bob',   101),
  (5002, 'mock_alice',  'mock_carol', 101),
  (5003, 'mock_bob',    'mock_alice', 102),
  (5004, 'mock_carol',  'mock_alice', 103),
  (5005, 'mock_carol',  'mock_bob',   103),
  (5006, 'mock_carol',  'mock_dave',  103),
  (5007, 'mock_dave',   'mock_alice', 104),
  (5008, 'mock_dave',   'mock_eve',   104),
  (5009, 'mock_eve',    'mock_carol', 105),
  (5010, 'mock_frank',  'mock_alice', 106),
  (5011, 'mock_frank',  'mock_eve',   106),
  (5012, 'mock_xiq',    'mock_alice', 108),
  (5013, 'mock_alice',  'mock_xiq',   101),
  -- Orphan following rows (pairs must not collide with the in-archive rows above)
  (5014, 'mock_xiq',    'mock_bob',   NULL),
  (5015, 'mock_alice',  'mock_eve',   NULL);

SELECT setval(pg_get_serial_sequence('public.following', 'id'), 6000);

-- Liked tweets
INSERT INTO "public"."liked_tweets" ("tweet_id", "full_text")
VALUES
  ('liked_t_1', 'This is a great insight about distributed systems'),
  ('liked_t_2', 'Love this approach to API design'),
  ('liked_t_3', 'CRDTs are underrated for collaborative apps')
ON CONFLICT ("tweet_id") DO NOTHING;

-- Likes — also includes orphan NULL archive_upload_id rows (scraper-inserted)
INSERT INTO "public"."likes" ("id", "account_id", "liked_tweet_id", "archive_upload_id") OVERRIDING SYSTEM VALUE
VALUES
  (7001, 'mock_alice', 'liked_t_1', 101),
  (7002, 'mock_bob',   'liked_t_2', 102),
  (7003, 'mock_xiq',   'liked_t_3', 108),
  -- Orphan likes
  (7004, 'mock_xiq',   'liked_t_1', NULL),
  (7005, 'mock_alice', 'liked_t_3', NULL);

SELECT setval(pg_get_serial_sequence('public.likes', 'id'), 8000);

-- Tweet URLs
INSERT INTO "public"."tweet_urls" ("id", "url", "expanded_url", "display_url", "tweet_id") OVERRIDING SYSTEM VALUE
VALUES
  (9001, 'https://t.co/abc123', 'https://github.com/community-archive', 'github.com/community-arc...', 't_alice_1');

SELECT setval(pg_get_serial_sequence('public.tweet_urls', 'id'), 10000);

-- User action log (mock history). Triggers are disabled by session_replication_role=replica
-- during seeding, so we insert these rows explicitly rather than letting trg_log_archive_upload_event fire.
INSERT INTO "public"."user_action_log" ("id", "account_id", "action_type", "metadata", "created_at") OVERRIDING SYSTEM VALUE
VALUES
  (1, 'mock_alice', 'archive_upload', '{"archive_upload_id": 101, "archive_at": "2024-12-01T00:00:00Z"}'::jsonb, '2024-12-01T00:05:00Z'),
  (2, 'mock_bob',   'archive_upload', '{"archive_upload_id": 102, "archive_at": "2024-12-01T00:00:00Z"}'::jsonb, '2024-12-01T00:10:00Z'),
  (3, 'mock_xiq',   'archive_upload', '{"archive_upload_id": 108, "archive_at": "2024-12-01T00:00:00Z"}'::jsonb, '2024-12-01T00:15:00Z'),
  -- Demonstration of settings-change events
  (4, 'mock_xiq',   'opt_in',         NULL,                                                                       '2024-12-02T08:00:00Z'),
  (5, 'mock_alice', 'archive_upload', '{"archive_upload_id": 109, "archive_at": "2025-02-15T00:00:00Z", "note":"re-upload"}'::jsonb, '2025-02-15T00:00:00Z');

SELECT setval(pg_get_serial_sequence('public.user_action_log', 'id'), 1000);

-- Bulky test account for verifying the inline export+delete path
-- ("Opt out and delete data" in /admin). Sized just under the 10k inline
-- ceiling so the dialog *doesn't* show the timeout warning — the delete
-- should run end-to-end against this account. If the warning needs
-- exercising too, bump num_tweets above 10000 (or seed a second account).
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

-- 5000 tweets generated inline. Keeps seed.sql small while still hitting
-- the row count the export path needs to exercise. Tweet ids are
-- 't_bulky_00001' .. 't_bulky_05000' so they sort lexically and don't
-- collide with hand-written ids elsewhere.
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
-- the "Opt out and delete data" dialog *should* show the ⚠ warning and
-- (almost certainly) hit the Vercel 60s function timeout when exercised.
-- Used to verify that the export gracefully fails halfway rather than
-- silently truncating. After timeout: opt-out + scrape-block already
-- committed synchronously, but archive copy + tweets dump and
-- delete_user_archive don't run — needs the Hetzner worker (TODO).
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

-- 100,000 tweets generated inline. Note: the staging-sync workflow does
-- a `supabase db reset` and re-applies this seed on every PR push, so
-- expect the staging sync step to take noticeably longer (~10-20s extra)
-- while this INSERT runs.
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

-- Reset replication role
SET session_replication_role = DEFAULT;
