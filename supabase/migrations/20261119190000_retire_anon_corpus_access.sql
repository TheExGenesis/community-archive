-- Retire anonymous corpus access (announced for 2026-11-19).
--
-- Supabase now serves the website's app features only. The corpus (tweets and
-- its siblings, the views over them, and the RPCs that read them) is no longer
-- readable with the public anon key; outside users move to API v1, the daily
-- export and llms.txt. The anon key itself keeps working for app features
-- (account, profile, user_directory, opt-in, digest, bulletin, gallery,
-- tes.blocked_scraping_users, tes.get_user_intercepted_stats, directory RPCs),
-- so this revokes per relation and per function instead of rotating the key.
--
-- authenticated and service_role keep exactly the access they had: signed-in
-- search and the server's service-role reads still work until they move to
-- ClickHouse. Tables are not dropped here.
--
-- Every statement is idempotent and skips relations or functions that do not
-- exist, so the migration applies to production, staging and a fresh local
-- stack alike. It ends by asserting that anon can no longer read any listed
-- relation or call any listed function, and warns about anything else
-- anon-callable that still mentions a corpus relation.
--
-- Rollback is at the end of this file, commented out.

-- Session-local work lists, dropped at the end of this file.
DROP TABLE IF EXISTS pg_temp.retire_corpus_relations;
DROP TABLE IF EXISTS pg_temp.retire_corpus_functions;
CREATE TEMP TABLE retire_corpus_relations (relation text PRIMARY KEY);
INSERT INTO retire_corpus_relations (relation) VALUES
  -- the 15 corpus tables
  ('public.tweets'),
  ('public.conversations'),
  ('public.tweet_media'),
  ('public.tweet_urls'),
  ('public.user_mentions'),
  ('public.mentioned_users'),
  ('public.quote_tweets'),
  ('public.retweets'),
  ('public.likes'),
  ('public.liked_tweets'),
  ('public.followers'),
  ('public.following'),
  ('private.tweet_user'),
  ('private.canonical_ingest_entity_versions'),
  ('private.canonical_ingest_receipts'),
  -- views and materialized views over the corpus
  ('public.enriched_tweets'),
  ('public.tweets_w_conversation_id'),
  ('public.tweet_replies_view'),
  ('public.global_monthly_tweet_counts'),
  ('public.monthly_tweet_counts_mv'),
  ('public.account_activity_summary'),
  ('public.global_activity_summary'),
  -- website caches keyed by tweet id; read by the server's service role only
  ('public.tweet_page_summaries'),
  ('public.tweet_link_previews')
ON CONFLICT DO NOTHING;

-- Functions that read corpus relations, by schema and name (every overload).
-- Derived from pg_proc (bodies that reference a corpus relation, plus
-- SECURITY DEFINER wrappers that call them) and cross-checked with the
-- 2026-11-19 dependency audit. Trigger functions are not RPCs and are left
-- alone; the opt-out and delete-my-data functions are not anon-callable and
-- are left alone too.
CREATE TEMP TABLE retire_corpus_functions (
  schema_name text,
  function_name text,
  PRIMARY KEY (schema_name, function_name)
);
INSERT INTO retire_corpus_functions (schema_name, function_name) VALUES
  ('public', 'search_tweets'),
  ('public', 'search_tweets_exact_phrase'),
  ('public', 'get_tweet_page_data'),
  ('public', 'word_occurrences'),
  ('public', 'get_trending_tweets'),
  ('public', 'get_latest_tweets'),
  ('public', 'get_main_thread'),
  ('public', 'get_monthly_tweet_counts'),
  ('public', 'get_monthly_tweet_counts_fast'),
  ('public', 'get_tweet_count_by_date'),
  ('public', 'get_tweet_counts_by_granularity'),
  ('public', 'get_simple_streamed_tweet_counts'),
  ('public', 'get_scraper_counts_by_granularity'),
  ('public', 'get_unique_scraper_count'),
  ('public', 'get_hourly_scraping_stats'),
  ('public', 'get_hourly_stats_simple'),
  ('public', 'get_streaming_stats'),
  ('public', 'get_streaming_stats_daily'),
  ('public', 'get_streaming_stats_daily_streamed_only'),
  ('public', 'get_streaming_stats_hourly'),
  ('public', 'get_streaming_stats_hourly_streamed_only'),
  ('public', 'get_streaming_stats_weekly'),
  ('public', 'get_streaming_stats_weekly_streamed_only'),
  ('public', 'get_top_liked_users'),
  ('public', 'get_top_mentioned_users'),
  ('public', 'get_top_retweeted_tweets_by_username'),
  ('public', 'get_most_liked_tweets_by_username'),
  ('public', 'get_most_mentioned_accounts_by_username'),
  ('public', 'get_account_most_liked_tweets_archive_users'),
  ('public', 'get_account_most_mentioned_accounts'),
  ('public', 'get_account_most_replied_tweets_by_archive_users'),
  ('public', 'get_account_top_favorite_count_tweets'),
  ('public', 'get_account_top_retweet_count_tweets'),
  ('public', 'apply_public_entities_rls_policies'),
  ('tes', 'search_tweets'),
  ('tes', 'get_tweet_counts_by_date'),
  ('tes', 'get_tweets_on_this_day'),
  ('ca_website', 'compute_hourly_scraping_stats'),
  ('private', 'update_conversation_ids'),
  ('private', 'update_conversation_ids_since'),
  ('private', 'update_conversation_ids_since_v2'),
  ('private', 'update_conversation_ids_since_v3'),
  ('private', 'time_conversation_update'),
  ('dev', 'apply_dev_entities_rls_policies'),
  ('dev', 'apply_dev_liked_tweets_rls_policies'),
  ('dev', 'apply_dev_rls_policies'),
  ('dev', 'delete_all_archives'),
  ('dev', 'get_top_accounts_with_followers')
ON CONFLICT DO NOTHING;

-- 1. Relations: anon loses every privilege; authenticated keeps SELECT if it
-- had it (directly or through PUBLIC); service_role keeps its grants.
DO $retire_anon_corpus_relations$
DECLARE
  item record;
  target regclass;
  authenticated_could_read boolean;
BEGIN
  FOR item IN SELECT relation FROM retire_corpus_relations ORDER BY relation LOOP
    target := to_regclass(item.relation);
    IF target IS NULL THEN
      RAISE NOTICE 'retire anon corpus access: % does not exist, skipped',
        item.relation;
      CONTINUE;
    END IF;
    authenticated_could_read :=
      has_table_privilege('authenticated', target, 'SELECT');
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %s FROM PUBLIC, anon', target);
    IF authenticated_could_read THEN
      EXECUTE format('GRANT SELECT ON TABLE %s TO authenticated', target);
    END IF;
  END LOOP;
END;
$retire_anon_corpus_relations$;

-- 2. Row-level security: permissive SELECT policies that applied to PUBLIC or
-- anon now apply to authenticated only (service_role bypasses RLS). The
-- conditions are unchanged.
DO $narrow_corpus_select_policies$
DECLARE
  policy record;
  kept_roles text;
BEGIN
  FOR policy IN
    SELECT p.schemaname, p.tablename, p.policyname, p.roles
    FROM pg_policies AS p
    JOIN retire_corpus_relations AS r
      ON r.relation = p.schemaname || '.' || p.tablename
    WHERE p.cmd IN ('SELECT', 'ALL')
      AND p.roles && ARRAY['public', 'anon']::name[]
  LOOP
    SELECT string_agg(quote_ident(role_name), ', ' ORDER BY role_name)
    INTO kept_roles
    FROM (
      SELECT unnest(policy.roles)::text AS role_name
      UNION
      SELECT 'authenticated'
    ) AS roles
    WHERE role_name NOT IN ('public', 'anon');
    EXECUTE format(
      'ALTER POLICY %I ON %I.%I TO %s',
      policy.policyname, policy.schemaname, policy.tablename, kept_roles
    );
  END LOOP;
END;
$narrow_corpus_select_policies$;

-- 3. Functions: revoke EXECUTE from PUBLIC and anon. authenticated and
-- service_role keep EXECUTE wherever they had it, directly or through PUBLIC,
-- so signed-in search and server reads are unchanged. SECURITY DEFINER
-- functions (get_streaming_stats_*, get_unique_scraper_count, ...) ignore
-- table grants, which is why they are revoked here explicitly.
DO $retire_anon_corpus_functions$
DECLARE
  target record;
  authenticated_could_call boolean;
  service_role_could_call boolean;
BEGIN
  FOR target IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    JOIN retire_corpus_functions AS f
      ON f.schema_name = n.nspname AND f.function_name = p.proname
    WHERE p.prokind = 'f'
    ORDER BY n.nspname, p.proname, p.oid
  LOOP
    authenticated_could_call :=
      has_function_privilege('authenticated', target.signature, 'EXECUTE');
    service_role_could_call :=
      has_function_privilege('service_role', target.signature, 'EXECUTE');
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon',
      target.signature);
    IF authenticated_could_call THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',
        target.signature);
    END IF;
    IF service_role_could_call THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',
        target.signature);
    END IF;
  END LOOP;
END;
$retire_anon_corpus_functions$;

-- 4. Default privileges: objects postgres creates later in public must not
-- become readable or callable by anon. This restates 060_grants.sql so the
-- migration holds even where an environment drifted, then reports any other
-- default ACL that still grants anon something in an app schema.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;

DO $check_anon_default_privileges$
DECLARE
  entry record;
BEGIN
  FOR entry IN
    SELECT pg_get_userbyid(d.defaclrole) AS owner_role, n.nspname,
      d.defaclobjtype,
      string_agg(a.privilege_type, ', ' ORDER BY a.privilege_type) AS privileges
    FROM pg_default_acl AS d
    JOIN pg_namespace AS n ON n.oid = d.defaclnamespace
    CROSS JOIN LATERAL aclexplode(d.defaclacl) AS a
    WHERE a.grantee = 'anon'::regrole
      AND n.nspname IN ('public', 'private', 'tes', 'ca_website', 'bulletin')
    GROUP BY 1, 2, 3
  LOOP
    IF entry.owner_role = 'postgres' AND entry.nspname = 'public' THEN
      RAISE EXCEPTION
        'default privileges still grant anon % on new objects of type % in public',
        entry.privileges, entry.defaclobjtype;
    END IF;
    -- tes keeps anon SELECT on new tables for the browser extension's
    -- blocked-user list; supabase_admin defaults belong to the platform and
    -- do not apply to objects that migrations create as postgres.
    RAISE NOTICE 'default privileges for % in % grant anon % on object type %',
      entry.owner_role, entry.nspname, entry.privileges, entry.defaclobjtype;
  END LOOP;
END;
$check_anon_default_privileges$;

-- 5. Verify: anon can read no listed relation and call no listed function.
-- Warn about any other anon-callable function in an API schema whose body
-- still names a corpus relation, so the operator sees it in the apply log.
DO $verify_anon_corpus_access$
DECLARE
  item record;
  target regclass;
  leftover record;
BEGIN
  FOR item IN SELECT relation FROM retire_corpus_relations LOOP
    target := to_regclass(item.relation);
    IF target IS NOT NULL
      AND has_table_privilege('anon', target, 'SELECT') THEN
      RAISE EXCEPTION 'anon can still read %', item.relation;
    END IF;
  END LOOP;

  FOR item IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    JOIN retire_corpus_functions AS f
      ON f.schema_name = n.nspname AND f.function_name = p.proname
    WHERE p.prokind = 'f'
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    RAISE EXCEPTION 'anon can still call %', item.signature;
  END LOOP;

  FOR leftover IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'tes')
      AND p.prokind = 'f'
      AND p.prorettype <> 'trigger'::regtype
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND lower(p.prosrc) ~ ('(^|[^a-z_])(tweets|conversations|tweet_media|'
        || 'tweet_urls|user_mentions|mentioned_users|quote_tweets|retweets|'
        || 'likes|liked_tweets|followers|following|tweet_user|enriched_tweets|'
        || 'tweets_w_conversation_id|tweet_replies_view|'
        || 'global_monthly_tweet_counts|monthly_tweet_counts_mv|'
        || 'account_activity_summary|global_activity_summary)([^a-z_]|$)')
  LOOP
    RAISE WARNING
      'anon can still call %, which mentions a corpus relation; review it',
      leftover.signature;
  END LOOP;
END;
$verify_anon_corpus_access$;

DROP TABLE pg_temp.retire_corpus_relations;
DROP TABLE pg_temp.retire_corpus_functions;

-- Rollback (restores anonymous corpus reads; run as postgres). Function and
-- relation grants to authenticated and service_role were not reduced, so only
-- anon (and PUBLIC for functions) needs restoring.
--
-- DO $rollback_retire_anon_corpus_access$
-- DECLARE
--   relation_name text;
--   target regclass;
--   policy record;
--   fn record;
-- BEGIN
--   FOREACH relation_name IN ARRAY ARRAY[
--     'public.tweets', 'public.conversations', 'public.tweet_media',
--     'public.tweet_urls', 'public.user_mentions', 'public.mentioned_users',
--     'public.quote_tweets', 'public.retweets', 'public.likes',
--     'public.liked_tweets', 'public.followers', 'public.following',
--     'public.enriched_tweets', 'public.tweets_w_conversation_id',
--     'public.tweet_replies_view', 'public.global_monthly_tweet_counts',
--     'public.monthly_tweet_counts_mv', 'public.global_activity_summary',
--     'public.tweet_page_summaries', 'public.tweet_link_previews'
--   ] LOOP
--     target := to_regclass(relation_name);
--     IF target IS NOT NULL THEN
--       EXECUTE format('GRANT SELECT ON TABLE %s TO anon', target);
--     END IF;
--   END LOOP;
--
--   -- Corpus SELECT policies applied to PUBLIC before, except the two cache
--   -- tables, which applied to anon and authenticated.
--   FOR policy IN
--     SELECT schemaname, tablename, policyname FROM pg_policies
--     WHERE schemaname = 'public' AND cmd = 'SELECT'
--       AND roles = ARRAY['authenticated']::name[]
--       AND tablename IN ('tweets', 'conversations', 'tweet_media',
--         'tweet_urls', 'user_mentions', 'mentioned_users', 'quote_tweets',
--         'retweets', 'likes', 'liked_tweets', 'followers', 'following',
--         'tweet_page_summaries', 'tweet_link_previews')
--   LOOP
--     EXECUTE format('ALTER POLICY %I ON %I.%I TO %s', policy.policyname,
--       policy.schemaname, policy.tablename,
--       CASE WHEN policy.tablename IN ('tweet_page_summaries',
--         'tweet_link_previews') THEN 'anon, authenticated' ELSE 'public' END);
--   END LOOP;
--
--   -- search_tweets and search_tweets_exact_phrase were granted to anon
--   -- directly; every other listed function was executable through PUBLIC.
--   FOR fn IN
--     SELECT p.oid::regprocedure AS signature, p.proname, n.nspname
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--     WHERE p.prokind = 'f' AND (n.nspname, p.proname) IN (
--       ('public', 'search_tweets'), ('public', 'search_tweets_exact_phrase'),
--       ('public', 'get_tweet_page_data'), ('public', 'word_occurrences'),
--       ('public', 'get_trending_tweets'), ('public', 'get_latest_tweets'),
--       ('public', 'get_main_thread'), ('public', 'get_monthly_tweet_counts'),
--       ('public', 'get_monthly_tweet_counts_fast'),
--       ('public', 'get_tweet_count_by_date'),
--       ('public', 'get_tweet_counts_by_granularity'),
--       ('public', 'get_simple_streamed_tweet_counts'),
--       ('public', 'get_scraper_counts_by_granularity'),
--       ('public', 'get_unique_scraper_count'),
--       ('public', 'get_hourly_scraping_stats'),
--       ('public', 'get_hourly_stats_simple'), ('public', 'get_streaming_stats'),
--       ('public', 'get_streaming_stats_daily'),
--       ('public', 'get_streaming_stats_daily_streamed_only'),
--       ('public', 'get_streaming_stats_hourly'),
--       ('public', 'get_streaming_stats_hourly_streamed_only'),
--       ('public', 'get_streaming_stats_weekly'),
--       ('public', 'get_streaming_stats_weekly_streamed_only'),
--       ('public', 'get_top_liked_users'), ('public', 'get_top_mentioned_users'),
--       ('public', 'get_top_retweeted_tweets_by_username'),
--       ('public', 'get_most_liked_tweets_by_username'),
--       ('public', 'get_most_mentioned_accounts_by_username'),
--       ('public', 'get_account_most_liked_tweets_archive_users'),
--       ('public', 'get_account_most_mentioned_accounts'),
--       ('public', 'get_account_most_replied_tweets_by_archive_users'),
--       ('public', 'get_account_top_favorite_count_tweets'),
--       ('public', 'get_account_top_retweet_count_tweets'),
--       ('tes', 'search_tweets'), ('tes', 'get_tweet_counts_by_date'),
--       ('tes', 'get_tweets_on_this_day'))
--   LOOP
--     EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %s', fn.signature,
--       CASE WHEN fn.nspname = 'public' AND fn.proname IN ('search_tweets',
--         'search_tweets_exact_phrase', 'get_streaming_stats_daily',
--         'get_streaming_stats_daily_streamed_only',
--         'get_streaming_stats_hourly',
--         'get_streaming_stats_hourly_streamed_only',
--         'get_streaming_stats_weekly',
--         'get_streaming_stats_weekly_streamed_only')
--       THEN 'anon' ELSE 'PUBLIC' END);
--   END LOOP;
-- END;
-- $rollback_retire_anon_corpus_access$;
