BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(12);

SELECT is(
  (
    SELECT pg_get_userbyid(nspowner)
    FROM pg_namespace
    WHERE nspname = 'temp'
  ),
  'postgres',
  'the retired temp namespace remains owned by postgres'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'temp'
      AND relation.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
  ),
  0,
  'legacy temp archive tables, views, and sequences are removed'
);

SELECT ok(
  NOT has_schema_privilege('anon', 'temp', 'USAGE')
  AND NOT has_schema_privilege('anon', 'temp', 'CREATE'),
  'anonymous API callers cannot use or create in the retired temp schema'
);

SELECT ok(
  NOT has_schema_privilege('authenticated', 'temp', 'USAGE')
  AND NOT has_schema_privilege('authenticated', 'temp', 'CREATE'),
  'authenticated API callers cannot use or create in the retired temp schema'
);

SELECT ok(
  NOT has_schema_privilege('service_role', 'temp', 'USAGE')
  AND NOT has_schema_privilege('service_role', 'temp', 'CREATE'),
  'the service role cannot use or create in the retired temp schema'
);

SELECT ok(
  NOT has_schema_privilege('readclient', 'temp', 'USAGE')
  AND NOT has_schema_privilege('readclient', 'temp', 'CREATE'),
  'the analytical read role cannot use or create in the retired temp schema'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
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
  ),
  'all public/dev legacy staging functions are removed'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname IN ('public', 'dev')
      AND procedure.proname IN (
        'process_archive',
        'process_and_insert_tweet_entities'
      )
  ),
  'the legacy raw archive-processing RPCs are removed'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    CROSS JOIN LATERAL aclexplode(
      COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
    ) AS acl
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
      AND acl.privilege_type = 'EXECUTE'
      AND acl.grantee <> procedure.proowner
  ),
  'trigger-only policy functions are not directly callable by API roles'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_default_acl AS defaults
    JOIN pg_namespace AS namespace
      ON namespace.oid = defaults.defaclnamespace
    CROSS JOIN LATERAL aclexplode(defaults.defaclacl) AS acl
    WHERE defaults.defaclrole = 'postgres'::regrole
      AND namespace.nspname = 'temp'
      AND acl.grantee <> defaults.defaclrole
      AND acl.privilege_type IN (
        'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
        'REFERENCES', 'TRIGGER', 'USAGE', 'EXECUTE'
      )
  ),
  'future postgres-owned temp objects receive no client privileges by default'
);

CREATE TABLE temp.liked_tweets_990000000000000201 (
  tweet_id text NOT NULL,
  full_text text NOT NULL
);
CREATE TABLE temp.likes_990000000000000201 (
  liked_tweet_id text NOT NULL,
  account_id text NOT NULL,
  archive_upload_id bigint
);

INSERT INTO temp.liked_tweets_990000000000000201 (tweet_id, full_text)
VALUES ('990000000000000202', 'must be discarded');
INSERT INTO temp.likes_990000000000000201 (
  liked_tweet_id, account_id, archive_upload_id
) VALUES (
  '990000000000000203', '990000000000000201', -990000000000000201
);

DO $preserve_test_staged_liked_tweet_ids$
DECLARE
  staging_table record;
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
    EXECUTE format(
      'INSERT INTO public.liked_tweets '
      '(tweet_id, full_text, author_account_id, is_tombstone) '
      'SELECT DISTINCT btrim(%1$I), '''', NULL, true '
      'FROM temp.%2$I '
      'WHERE NULLIF(btrim(%1$I), '''') IS NOT NULL '
      'ON CONFLICT (tweet_id) DO NOTHING',
      staging_table.id_column,
      staging_table.table_name
    );
  END LOOP;
END;
$preserve_test_staged_liked_tweet_ids$;

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.liked_tweets
    WHERE tweet_id IN ('990000000000000202', '990000000000000203')
      AND full_text = ''
      AND author_account_id IS NULL
      AND is_tombstone IS TRUE
  ),
  2,
  'stable IDs from staged liked payloads and relationships become tombstones'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.likes
    WHERE liked_tweet_id = '990000000000000203'
  ),
  0,
  'an orphaned staged like relationship is not promoted canonically'
);

SELECT * FROM finish();

ROLLBACK;
