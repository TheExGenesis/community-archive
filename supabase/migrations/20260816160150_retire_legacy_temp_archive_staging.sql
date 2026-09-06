-- Retire the obsolete archive-upload staging RPCs and the exposed temp schema.
-- Staged payloads were never a consent-safe source of truth. Preserve any
-- previously unseen liked-tweet IDs as minimal tombstones, but never promote
-- their raw content or orphaned relationships into canonical storage.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

-- Remove the callable surface before inspecting staged rows. DROP without
-- CASCADE is deliberate: an unexpected dependency aborts the migration instead
-- of deleting live code. Any in-flight legacy call must finish before this DDL
-- can proceed.
DO $drop_legacy_temp_functions$
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
$drop_legacy_temp_functions$;

-- Freeze every recognized staging table before copying IDs. Locks are acquired
-- in a stable order and held to transaction end, closing the copy/drop race.
DO $lock_archive_staging_tables$
DECLARE
  staging_table record;
BEGIN
  FOR staging_table IN
    SELECT relation.relname AS table_name
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'temp'
      AND relation.relkind IN ('r', 'p')
      AND relation.relname ~ '^(account|archive_upload|profile|tweets|mentioned_users|user_mentions|tweet_urls|tweet_media|followers|following|liked_tweets|likes)_[A-Za-z0-9_]+$'
    ORDER BY relation.oid
  LOOP
    EXECUTE format(
      'LOCK TABLE temp.%I IN ACCESS EXCLUSIVE MODE',
      staging_table.table_name
    );
  END LOOP;
END;
$lock_archive_staging_tables$;

-- Preserve every stable liked-tweet ID before deleting abandoned staging.
-- Payload text is intentionally ignored, and orphaned like relationships are
-- intentionally not promoted into public.likes.
DO $preserve_staged_liked_tweet_ids$
DECLARE
  staging_table record;
  stable_id_column text;
BEGIN
  FOR staging_table IN
    SELECT
      relation.relname AS table_name,
      CASE
        WHEN relation.relname ~ '^liked_tweets_[A-Za-z0-9_]+$'
          THEN 'tweet_id'
        WHEN relation.relname ~ '^likes_[A-Za-z0-9_]+$'
          THEN 'liked_tweet_id'
      END AS id_column
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'temp'
      AND relation.relkind IN ('r', 'p')
      AND (
        relation.relname ~ '^liked_tweets_[A-Za-z0-9_]+$'
        OR relation.relname ~ '^likes_[A-Za-z0-9_]+$'
      )
  LOOP
    stable_id_column := staging_table.id_column;
    EXECUTE format(
      'INSERT INTO public.liked_tweets '
      '(tweet_id, full_text, author_account_id, is_tombstone) '
      'SELECT DISTINCT btrim(%1$I), '''', NULL, true '
      'FROM temp.%2$I '
      'WHERE NULLIF(btrim(%1$I), '''') IS NOT NULL '
      'ON CONFLICT (tweet_id) DO NOTHING',
      stable_id_column,
      staging_table.table_name
    );
  END LOOP;
END;
$preserve_staged_liked_tweet_ids$;

-- Drop only archive-staging tables with the historical naming contract. If an
-- unexpected relation remains, abort rather than cascading through an unknown
-- object.
DO $drop_archive_staging_tables$
DECLARE
  staging_table record;
BEGIN
  FOR staging_table IN
    SELECT relation.relname AS table_name
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'temp'
      AND relation.relkind IN ('r', 'p')
      AND relation.relname ~ '^(account|archive_upload|profile|tweets|mentioned_users|user_mentions|tweet_urls|tweet_media|followers|following|liked_tweets|likes)_[A-Za-z0-9_]+$'
  LOOP
    EXECUTE format(
      'DROP TABLE temp.%I',
      staging_table.table_name
    );
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'temp'
      AND relation.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
  ) THEN
    RAISE EXCEPTION
      'unexpected relation remains in retired temp schema; refusing a broad cascade';
  END IF;
END;
$drop_archive_staging_tables$;

CREATE SCHEMA IF NOT EXISTS temp AUTHORIZATION postgres;
ALTER SCHEMA temp OWNER TO postgres;

-- The API configuration still names temp for compatibility. Keep it as an
-- empty, fenced namespace so no client or service key can recreate staging.
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

COMMIT;
