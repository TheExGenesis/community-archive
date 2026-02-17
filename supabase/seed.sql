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
  ('mock_alice',  'web', 'alice_dev',   '2019-03-15T10:00:00Z', 'Alice Developer', 3, 2, 4, 0),
  ('mock_bob',    'web', 'bob_writes',  '2020-06-01T12:00:00Z', 'Bob Writes',      2, 1, 2, 0),
  ('mock_carol',  'web', 'carol_ml',    '2018-11-20T08:00:00Z', 'Carol ML',        2, 3, 2, 0),
  ('mock_dave',   'web', 'dave_design', '2021-01-10T14:00:00Z', 'Dave Design',     1, 2, 1, 0),
  ('mock_eve',    'web', 'eve_data',    '2020-09-05T16:00:00Z', 'Eve Data',        2, 1, 1, 0),
  ('mock_frank',  'web', 'frank_ops',   '2022-02-14T09:00:00Z', 'Frank Ops',       1, 2, 0, 0),
  ('mock_quoted', 'web', 'quoteduser',  '2017-05-01T00:00:00Z', 'Quoted User',     1, 0, 0, 0);

-- Archive uploads (must be 'completed' for account/profile views to work)
INSERT INTO "public"."archive_upload" ("id", "account_id", "archive_at", "created_at", "upload_phase") OVERRIDING SYSTEM VALUE
VALUES
  (101, 'mock_alice',  '2024-12-01T00:00:00Z', '2024-12-01T00:00:00Z', 'completed'),
  (102, 'mock_bob',    '2024-12-01T00:00:00Z', '2024-12-01T00:00:00Z', 'completed'),
  (103, 'mock_carol',  '2024-12-01T00:00:00Z', '2024-12-01T00:00:00Z', 'completed'),
  (104, 'mock_dave',   '2024-12-01T00:00:00Z', '2024-12-01T00:00:00Z', 'completed'),
  (105, 'mock_eve',    '2024-12-01T00:00:00Z', '2024-12-01T00:00:00Z', 'completed'),
  (106, 'mock_frank',  '2024-12-01T00:00:00Z', '2024-12-01T00:00:00Z', 'completed'),
  (107, 'mock_quoted', '2024-12-01T00:00:00Z', '2024-12-01T00:00:00Z', 'completed');

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
  ('mock_quoted', 'Quotes and RTs',                      NULL,                    NULL,            'https://api.dicebear.com/7.x/avataaars/svg?seed=quoteduser',  NULL, 107);

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
  ('t_quoted_1', 'mock_quoted', '2024-10-15T12:00:00Z', 'The best code is the code you never write. Reduce complexity before adding features.', 30, 120, NULL, NULL, NULL, 107);

-- Conversations (link tweets to conversation threads)
INSERT INTO "public"."conversations" ("conversation_id", "tweet_id", "account_id")
VALUES
  -- Alice's thread is one conversation
  ('t_alice_1', 't_alice_1', 'mock_alice'),
  ('t_alice_1', 't_alice_2', 'mock_alice'),
  ('t_alice_1', 't_alice_3', 'mock_alice'),
  ('t_alice_1', 't_bob_1',   'mock_bob');

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
  ('mu_bob',   'Bob Writes',      'bob_writes', '2024-12-01T00:00:00Z')
ON CONFLICT ("user_id") DO NOTHING;

-- User mentions (who was mentioned in which tweet)
INSERT INTO "public"."user_mentions" ("id", "mentioned_user_id", "tweet_id") OVERRIDING SYSTEM VALUE
VALUES
  (2001, 'mu_alice', 't_bob_1');

SELECT setval(pg_get_serial_sequence('public.user_mentions', 'id'), 3000);

-- Quote tweets
INSERT INTO "public"."quote_tweets" ("tweet_id", "quoted_tweet_id")
VALUES
  ('t_eve_2', 't_quoted_1');

-- Followers
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
  (3010, 'mock_eve',   'mock_frank',  105);

SELECT setval(pg_get_serial_sequence('public.followers', 'id'), 4000);

-- Following
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
  (5011, 'mock_frank',  'mock_eve',   106);

SELECT setval(pg_get_serial_sequence('public.following', 'id'), 6000);

-- Liked tweets
INSERT INTO "public"."liked_tweets" ("tweet_id", "full_text")
VALUES
  ('liked_t_1', 'This is a great insight about distributed systems'),
  ('liked_t_2', 'Love this approach to API design')
ON CONFLICT ("tweet_id") DO NOTHING;

-- Likes
INSERT INTO "public"."likes" ("id", "account_id", "liked_tweet_id", "archive_upload_id") OVERRIDING SYSTEM VALUE
VALUES
  (7001, 'mock_alice', 'liked_t_1', 101),
  (7002, 'mock_bob',   'liked_t_2', 102);

SELECT setval(pg_get_serial_sequence('public.likes', 'id'), 8000);

-- Tweet URLs
INSERT INTO "public"."tweet_urls" ("id", "url", "expanded_url", "display_url", "tweet_id") OVERRIDING SYSTEM VALUE
VALUES
  (9001, 'https://t.co/abc123', 'https://github.com/community-archive', 'github.com/community-arc...', 't_alice_1');

SELECT setval(pg_get_serial_sequence('public.tweet_urls', 'id'), 10000);

-- Reset replication role
SET session_replication_role = DEFAULT;
