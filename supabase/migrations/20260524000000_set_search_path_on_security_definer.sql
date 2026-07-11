-- Security hardening: pin search_path on SECURITY DEFINER functions in
-- supabase/schemas/070_functions.sql that previously lacked it.
--
-- Without an explicit search_path, a SECURITY DEFINER function inherits the
-- caller's search_path. An authenticated user can prepend a malicious schema
-- (e.g., create a function in pg_temp that shadows `auth.identities`) and
-- thereby trick a SECURITY DEFINER function into returning attacker-controlled
-- data while executing as the postgres role. The most sensitive case is
-- `private.get_provider_id()`, which is used by RLS-relevant code paths and,
-- if compromised, would let an authenticated user impersonate another archive
-- owner.
--
-- We set `search_path = ''` to force every reference inside these function
-- bodies to be schema-qualified. Where bodies referenced unqualified objects
-- we re-create the function with fully-qualified identifiers; everywhere else
-- we use ALTER FUNCTION to set search_path without touching the body.

BEGIN;

-- =========================
-- ALTER FUNCTION: bodies already fully-qualified, only need search_path
-- =========================

ALTER FUNCTION "private"."get_provider_id"()
    SET "search_path" TO '';

ALTER FUNCTION "public"."compute_hourly_scraping_stats"(timestamp with time zone, timestamp with time zone)
    SET "search_path" TO '';

ALTER FUNCTION "public"."create_temp_tables"("text")
    SET "search_path" TO '';

ALTER FUNCTION "public"."drop_temp_tables"("text")
    SET "search_path" TO '';

ALTER FUNCTION "public"."commit_temp_data"("text")
    SET "search_path" TO '';

ALTER FUNCTION "public"."delete_tweets"("text"[])
    SET "search_path" TO '';

ALTER FUNCTION "public"."delete_user_archive"("text")
    SET "search_path" TO '';

ALTER FUNCTION "public"."delete_single_archive"("text", bigint)
    SET "search_path" TO '';

ALTER FUNCTION "public"."get_hourly_scraping_stats"(integer)
    SET "search_path" TO '';

ALTER FUNCTION "public"."search_tweets"("text", "text", "text", "date", "date", integer, integer)
    SET "search_path" TO '';

ALTER FUNCTION "public"."search_tweets_exact_phrase"("text", "text", "text", "date", "date", integer, integer)
    SET "search_path" TO '';

-- The original audit list missed legacy SECURITY DEFINER functions that are
-- still present in production. Their bodies contain intentional unqualified
-- references, so pin them to app-owned schemas instead of inheriting a
-- caller-controlled path. None of these schemas is writable by API roles.
ALTER FUNCTION "public"."get_non_allowlist_streamed_tweet_candidates"(integer)
    SET "search_path" TO 'pg_catalog', 'public', 'private', 'temp', 'tes', 'ca_website', 'auth', 'extensions';
ALTER FUNCTION "public"."delete_non_allowlist_streamed_tweet_batch"(integer)
    SET "search_path" TO 'pg_catalog', 'public', 'private', 'temp', 'tes', 'ca_website', 'auth', 'extensions';
ALTER FUNCTION "public"."insert_temp_archive_upload"(text, timestamp with time zone, boolean, boolean, date, date, text)
    SET "search_path" TO 'pg_catalog', 'public', 'private', 'temp', 'tes', 'ca_website', 'auth', 'extensions';
ALTER FUNCTION "public"."insert_temp_followers"(jsonb, text, text)
    SET "search_path" TO 'pg_catalog', 'public', 'private', 'temp', 'tes', 'ca_website', 'auth', 'extensions';
ALTER FUNCTION "public"."insert_temp_following"(jsonb, text, text)
    SET "search_path" TO 'pg_catalog', 'public', 'private', 'temp', 'tes', 'ca_website', 'auth', 'extensions';
ALTER FUNCTION "public"."insert_temp_likes"(jsonb, text, text)
    SET "search_path" TO 'pg_catalog', 'public', 'private', 'temp', 'tes', 'ca_website', 'auth', 'extensions';
ALTER FUNCTION "public"."insert_temp_profiles"(jsonb, text, text)
    SET "search_path" TO 'pg_catalog', 'public', 'private', 'temp', 'tes', 'ca_website', 'auth', 'extensions';
ALTER FUNCTION "public"."insert_temp_tweets"(jsonb, text)
    SET "search_path" TO 'pg_catalog', 'public', 'private', 'temp', 'tes', 'ca_website', 'auth', 'extensions';
ALTER FUNCTION "public"."process_and_insert_tweet_entities"(jsonb, text)
    SET "search_path" TO 'pg_catalog', 'public', 'private', 'temp', 'tes', 'ca_website', 'auth', 'extensions';
ALTER FUNCTION "public"."process_archive"(jsonb)
    SET "search_path" TO 'pg_catalog', 'public', 'private', 'temp', 'tes', 'ca_website', 'auth', 'extensions';
ALTER FUNCTION "public"."refresh_global_activity_summary"()
    SET "search_path" TO 'pg_catalog', 'public', 'private', 'temp', 'tes', 'ca_website', 'auth', 'extensions';
ALTER FUNCTION "tes"."get_tweet_counts_by_date"()
    SET "search_path" TO 'pg_catalog', 'public', 'private', 'temp', 'tes', 'ca_website', 'auth', 'extensions';
ALTER FUNCTION "tes"."get_tweets_on_this_day"(integer)
    SET "search_path" TO 'pg_catalog', 'public', 'private', 'temp', 'tes', 'ca_website', 'auth', 'extensions';
ALTER FUNCTION "tes"."get_user_intercepted_stats"(integer)
    SET "search_path" TO 'pg_catalog', 'public', 'private', 'temp', 'tes', 'ca_website', 'auth', 'extensions';
ALTER FUNCTION "tes"."search_liked_tweets"(text, text, text, date, date, integer, integer, integer, integer, integer)
    SET "search_path" TO 'pg_catalog', 'public', 'private', 'temp', 'tes', 'ca_website', 'auth', 'extensions';

-- Test-only helper was meant to be removed by the 20250912 cleanup but is
-- still present in production. It is PUBLIC-executable and has no live caller.
DROP FUNCTION IF EXISTS "private"."commit_temp_data_test"(text);

-- =========================
-- CREATE OR REPLACE: bodies contained unqualified references that must be
-- schema-qualified now that search_path is empty.
-- =========================

-- tes.get_current_account_id: was `JOIN account a` (unqualified)
CREATE OR REPLACE FUNCTION "tes"."get_current_account_id"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_account_id TEXT;
BEGIN
    SELECT a.account_id INTO v_account_id
    FROM auth.users u
    JOIN public.account a ON a.account_id = u.raw_user_meta_data->>'provider_id'
    WHERE u.id = auth.uid();

    RETURN v_account_id;
END;
$$;

-- tes.get_followers: was `LEFT JOIN mentioned_users` (unqualified)
CREATE OR REPLACE FUNCTION "tes"."get_followers"() RETURNS TABLE("account_id" "text", "username" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_account_id TEXT;
BEGIN
    -- Get the current user's account_id
    v_account_id := tes.get_current_account_id();

    RETURN QUERY
    SELECT
        f1.follower_account_id AS account_id,
        mu.screen_name AS username
    FROM public.followers f1
    LEFT JOIN public.mentioned_users mu ON mu.user_id = f1.follower_account_id
    WHERE f1.account_id = v_account_id and mu.screen_name is not null;
END;
$$;

-- tes.get_followings: was `LEFT JOIN mentioned_users` (unqualified)
CREATE OR REPLACE FUNCTION "tes"."get_followings"() RETURNS TABLE("account_id" "text", "username" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_account_id TEXT;
BEGIN
    -- Get the current user's account_id
    v_account_id := tes.get_current_account_id();

    RETURN QUERY
    SELECT
        f2.following_account_id AS account_id,
        mu.screen_name AS username
    FROM public.following f2
    LEFT JOIN public.mentioned_users mu ON mu.user_id = f2.following_account_id
    WHERE f2.account_id = v_account_id and mu.screen_name is not null;
END;
$$;

-- tes.get_moots: was `left join mentioned_users` (unqualified)
CREATE OR REPLACE FUNCTION "tes"."get_moots"() RETURNS TABLE("account_id" "text", "username" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_account_id TEXT;
BEGIN
    -- Get the current user's account_id
    v_account_id := tes.get_current_account_id();

    RETURN QUERY
    SELECT
        f1.follower_account_id as account_id,
        mu.screen_name as username
    FROM public.followers f1
    INNER JOIN public.following f2
        ON f1.account_id = f2.account_id
        AND f1.follower_account_id = f2.following_account_id
    left join public.mentioned_users mu on mu.user_id = f1.follower_account_id
    where f1.account_id = v_account_id;
END;
$$;

COMMIT;
