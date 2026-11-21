-- prod.sql preserves legacy grants for dump compatibility. This file runs after
-- it and narrows privileges, so schema rebuilds cannot re-expose write access
-- or policy-sensitive snapshots.

-- prod.sql retains legacy GRANT ALL statements for this public counter.
-- Public roles may read it, while only trusted service code may mutate it.
REVOKE ALL PRIVILEGES ON TABLE "public"."scraper_count"
  FROM PUBLIC, "anon", "authenticated";
GRANT SELECT ON TABLE "public"."scraper_count" TO "anon", "authenticated";
GRANT ALL PRIVILEGES ON TABLE "public"."scraper_count" TO "service_role";

-- These tables are populated only by trusted service-role routes and workers.
-- Public/authenticated clients retain read access but no direct write grants.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE
  "public"."all_profile",
  "public"."followers",
  "public"."following",
  "public"."likes",
  "public"."tweets",
  "public"."tweet_media",
  "public"."tweet_urls",
  "public"."user_mentions",
  "public"."optin"
FROM "anon", "authenticated";

REVOKE ALL ON TABLE public.account_activity_summary
  FROM PUBLIC, anon, authenticated, readclient;
REVOKE ALL ON TABLE public.global_activity_summary
  FROM PUBLIC, anon, authenticated, readclient;
REVOKE ALL ON TABLE private.archive_clickhouse_delivery
  FROM PUBLIC, anon, authenticated, readclient, service_role;
REVOKE ALL ON TABLE private.archive_clickhouse_graph_purge
  FROM PUBLIC, anon, authenticated, readclient, service_role;

REVOKE ALL ON FUNCTION public.policy_account_is_blocked(text, text)
  FROM PUBLIC, anon, authenticated, readclient;
REVOKE ALL ON FUNCTION public.policy_json_contains_blocked_author(jsonb)
  FROM PUBLIC, anon, authenticated, readclient;
REVOKE ALL ON FUNCTION private.policy_authority_fingerprint()
  FROM PUBLIC, anon, authenticated, readclient, service_role;
REVOKE ALL ON FUNCTION public.policy_blocked_account_id(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lock_policy_account(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.archive_upload_is_allowed(text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_archive_upload_allowed(text, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.enqueue_policy_archive_cleanup(text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.reconcile_legacy_liked_tweets_batch(integer)
  FROM PUBLIC, anon, authenticated, readclient, service_role;
REVOKE EXECUTE ON FUNCTION tes.search_liked_tweets(
  text, text, text, date, date, integer, integer, integer, integer, integer
) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.search_tweets(
  text, text, text, date, date, integer, integer
) FROM PUBLIC, readclient;
REVOKE EXECUTE ON FUNCTION public.search_tweets(
  text, integer, text, timestamp without time zone,
  timestamp without time zone
) FROM PUBLIC, readclient;
REVOKE EXECUTE ON FUNCTION public.search_tweets_exact_phrase(
  text, text, text, date, date, integer, integer
) FROM PUBLIC, readclient;
REVOKE EXECUTE ON FUNCTION tes.get_followers()
  FROM PUBLIC, anon, authenticated, readclient, service_role;
REVOKE EXECUTE ON FUNCTION tes.get_followings()
  FROM PUBLIC, anon, authenticated, readclient, service_role;
REVOKE EXECUTE ON FUNCTION tes.get_moots()
  FROM PUBLIC, anon, authenticated, readclient, service_role;

GRANT EXECUTE ON FUNCTION public.policy_account_is_blocked(text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.policy_json_contains_blocked_author(jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.policy_blocked_account_id(text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.lock_policy_account(text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.assert_archive_upload_allowed(text, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_policy_archive_cleanup(text, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.search_tweets(
  text, text, text, date, date, integer, integer
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_tweets(
  text, integer, text, timestamp without time zone,
  timestamp without time zone
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_tweets_exact_phrase(
  text, text, text, date, date, integer, integer
) TO authenticated, service_role;

-- Legacy archive upload staging is retired. prod.sql retains the old function
-- definitions and grants for dump compatibility, so remove them last. DROP
-- without CASCADE makes an unexpected live dependency fail closed.
DO $retire_legacy_temp_functions$
DECLARE
  legacy_function record;
BEGIN
  FOR legacy_function IN
    SELECT
      namespace.nspname AS schema_name,
      procedure.proname AS function_name,
      pg_get_function_identity_arguments(procedure.oid) AS identity_arguments
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname IN ('public', 'dev')
      AND procedure.proname IN (
        'process_archive',
        'process_and_insert_tweet_entities',
        'create_temp_tables',
        'drop_temp_tables',
        'commit_temp_data',
        'insert_temp_account',
        'insert_temp_archive_upload',
        'insert_temp_followers',
        'insert_temp_following',
        'insert_temp_likes',
        'insert_temp_profiles',
        'insert_temp_tweets'
      )
  LOOP
    EXECUTE format(
      'DROP FUNCTION %I.%I(%s)',
      legacy_function.schema_name,
      legacy_function.function_name,
      legacy_function.identity_arguments
    );
  END LOOP;
END;
$retire_legacy_temp_functions$;

-- Trigger functions are internal enforcement hooks, not RPCs. PostgreSQL
-- triggers do not require callers to retain direct EXECUTE on their functions.
DO $revoke_policy_trigger_rpc_access$
DECLARE
  trigger_function record;
BEGIN
  FOR trigger_function IN
    SELECT
      namespace.nspname AS schema_name,
      procedure.proname AS function_name,
      pg_get_function_identity_arguments(procedure.oid) AS identity_arguments
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname IN (
        'apply_policy_block_tombstone',
        'capture_policy_block_username',
        'enforce_policy_account_tombstone',
        'enforce_policy_archive_object',
        'enforce_policy_liked_tweet_tombstone',
        'enforce_policy_mentioned_user_tombstone',
        'enforce_policy_tweet_tombstone',
        'log_archive_upload_event',
        'protect_policy_tombstone_delete',
        'reject_policy_blocked_account_detail',
        'reject_policy_blocked_json_payload',
        'reject_policy_tombstone_tweet_detail'
      )
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON FUNCTION %I.%I(%s) '
      'FROM PUBLIC, anon, authenticated, readclient, service_role',
      trigger_function.schema_name,
      trigger_function.function_name,
      trigger_function.identity_arguments
    );
  END LOOP;
END;
$revoke_policy_trigger_rpc_access$;

REVOKE ALL PRIVILEGES ON SCHEMA temp
  FROM PUBLIC, anon, authenticated, readclient, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA temp
  REVOKE ALL PRIVILEGES ON TABLES
  FROM PUBLIC, anon, authenticated, readclient, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA temp
  REVOKE ALL PRIVILEGES ON SEQUENCES
  FROM PUBLIC, anon, authenticated, readclient, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA temp
  REVOKE EXECUTE ON FUNCTIONS
  FROM PUBLIC, anon, authenticated, readclient, service_role;

-- Private Bulletin opportunities
ALTER TABLE bulletin.decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulletin.opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulletin.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulletin.worker_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON SCHEMA bulletin FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA bulletin FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA bulletin FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA bulletin TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA bulletin TO service_role;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA bulletin TO service_role;
REVOKE ALL ON FUNCTION public.get_bulletin_opportunities(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_bulletin_opportunities(integer) TO service_role;

ALTER TABLE bulletin.runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON bulletin.runs FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE bulletin.runs_id_seq FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON bulletin.runs TO service_role;
GRANT USAGE,SELECT ON SEQUENCE bulletin.runs_id_seq TO service_role;
REVOKE ALL ON FUNCTION public.get_bulletin_runs(bigint,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_bulletin_runs(bigint,integer) TO service_role;

ALTER TABLE bulletin.prompt_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON bulletin.prompt_versions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON bulletin.prompt_versions TO service_role;
REVOKE ALL ON SEQUENCE bulletin.prompt_versions_id_seq FROM PUBLIC,anon,authenticated;
GRANT USAGE,SELECT ON SEQUENCE bulletin.prompt_versions_id_seq TO service_role;
REVOKE ALL ON FUNCTION public.get_bulletin_prompts(bigint) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.save_bulletin_prompt(bigint,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_bulletin_prompts(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_bulletin_prompt(bigint,text,text,uuid) TO service_role;

ALTER TABLE bulletin.scans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON bulletin.scans FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON bulletin.scans TO service_role;
REVOKE ALL ON FUNCTION public.get_bulletin_board_state(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_bulletin_board_state(integer) TO service_role;

REVOKE ALL ON FUNCTION public.get_bulletin_relationships(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_bulletin_relationships(text,text) TO service_role;

ALTER TABLE bulletin.refresh_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON bulletin.refresh_requests FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON bulletin.refresh_requests TO service_role;
REVOKE ALL ON FUNCTION public.request_bulletin_refresh(uuid,text,bigint,numeric,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.get_bulletin_refreshes() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.request_bulletin_refresh(uuid,text,bigint,numeric,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_bulletin_refreshes() TO service_role;
ALTER TABLE bulletin.dismissals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON bulletin.dismissals FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,DELETE ON bulletin.dismissals TO service_role;
REVOKE ALL ON FUNCTION public.get_bulletin_dismissals(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.set_bulletin_dismissal(uuid,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_bulletin_dismissals(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_bulletin_dismissal(uuid,text,text,boolean) TO service_role;

ALTER TABLE bulletin.pipeline_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulletin.jev_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON bulletin.pipeline_state,bulletin.jev_items FROM PUBLIC,anon,authenticated;
-- The schema-wide service-role grant above predates this table in the
-- migration history, so the pipeline cursor stays read-only for service_role.
REVOKE INSERT,UPDATE,DELETE ON bulletin.pipeline_state FROM service_role;
GRANT SELECT ON bulletin.pipeline_state TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON bulletin.jev_items TO service_role;

ALTER TABLE private.public_api_consumers ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.public_api_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.public_api_consumers, private.public_api_keys
  FROM PUBLIC, anon, authenticated, readclient, service_role;
GRANT SELECT, INSERT, UPDATE ON private.public_api_consumers, private.public_api_keys TO service_role;
REVOKE ALL ON FUNCTION public.create_public_api_key(uuid,text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_public_api_keys(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_public_api_key(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verify_public_api_key(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_public_api_key(uuid,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_public_api_keys(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_public_api_key(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_public_api_key(text,text) TO service_role;

REVOKE ALL ON TABLE public.directory_hidden_users FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.directory_hidden_users TO service_role;

-- Anonymous corpus access was retired on 2026-11-19
-- (20261119190000_retire_anon_corpus_access.sql). prod.sql still carries the
-- legacy anon grants on corpus tables, views and RPCs, so the narrowing runs
-- here, after it. Keep this block in step with that migration.
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

-- Forecast track record: service-role functions only; no client role reads the tables.
ALTER TABLE private.forecast_track_record_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.forecast_track_record_authors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.forecast_track_record_runs, private.forecast_track_record_authors
  FROM PUBLIC, anon, authenticated, readclient, service_role;
