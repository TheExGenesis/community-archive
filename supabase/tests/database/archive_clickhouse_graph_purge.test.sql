BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(13);

INSERT INTO public.all_account (
  account_id, created_via, username, created_at, account_display_name
) VALUES
  ('990000000000000101', 'test', '__pgtap_graph_a', now(), 'Graph A'),
  ('990000000000000102', 'test', '__pgtap_graph_b', now(), 'Graph B'),
  ('990000000000000103', 'test', '__pgtap_graph_c', now(), 'Graph C');

INSERT INTO public.archive_upload (id, account_id, archive_at, username, upload_phase)
OVERRIDING SYSTEM VALUE
VALUES
  (990000101, '990000000000000101', '2026-01-01', '__pgtap_graph_a', 'completed'),
  (990000102, '990000000000000101', '2026-02-01', '__pgtap_graph_a', 'completed'),
  (990000103, '990000000000000102', '2026-01-01', '__pgtap_graph_b', 'completed');

INSERT INTO public.liked_tweets (tweet_id, full_text, is_tombstone)
VALUES ('990000000000000901', '', true);
INSERT INTO public.likes (account_id, liked_tweet_id, archive_upload_id)
VALUES ('990000000000000101', '990000000000000901', 990000101);
INSERT INTO public.followers (account_id, follower_account_id, archive_upload_id)
VALUES ('990000000000000102', '990000000000000902', 990000103);

-- One archive of a multi-archive account.
SELECT public.delete_single_archive('990000000000000101', 990000101);

SELECT is(
  (SELECT count(*)::int FROM private.archive_clickhouse_graph_purge
   WHERE account_id = '990000000000000101'
     AND purge_scope = 'archive_upload'
     AND archive_upload_id = 990000101
     AND reason = 'delete_single_archive'
     AND purge_state = 'pending'),
  1,
  'deleting one archive queues a purge scoped to that upload'
);

SELECT is(
  (SELECT count(*)::int FROM public.likes
   WHERE account_id = '990000000000000101'),
  0,
  'the PostgreSQL delete itself is unchanged'
);

SELECT public.delete_user_archive('990000000000000102');

SELECT is(
  (SELECT count(*)::int FROM private.archive_clickhouse_graph_purge
   WHERE account_id = '990000000000000102'
     AND purge_scope = 'account'
     AND archive_upload_id IS NULL
     AND reason = 'delete_user_archive'),
  1,
  'deleting every archive queues an account-scoped ClickHouse purge'
);

SELECT public.delete_user_archive('990000000000000102');

SELECT is(
  (SELECT count(*)::int FROM private.archive_clickhouse_graph_purge
   WHERE account_id = '990000000000000102'
     AND purge_state = 'pending'),
  2,
  'every deletion queues its own idempotent request'
);

SELECT ok(
  pg_get_functiondef(
    'private.enqueue_archive_clickhouse_graph_purge(text, text, bigint, text)'::regprocedure
  ) !~ 'lock_policy_account',
  'queueing never waits for the policy lock held during uploads and purges'
);

SELECT public.tombstone_policy_account('990000000000000103');

SELECT is(
  (SELECT count(*)::int FROM private.archive_clickhouse_graph_purge
   WHERE account_id = '990000000000000103'
     AND purge_scope = 'account'
     AND reason = 'policy_tombstone'),
  1,
  'an opt-out queues a full ClickHouse likes/follows purge'
);

SELECT lives_ok(
  $$ SELECT private.enqueue_archive_clickhouse_graph_purge(
       'account', 'policy_unknown:990000000000000904', NULL, 'policy_tombstone'
     ) $$,
  'a legacy non-numeric account identifier never fails the caller'
);

SELECT is(
  (SELECT count(*)::int FROM private.archive_clickhouse_graph_purge
   WHERE account_id LIKE 'policy_unknown:%'),
  0,
  'non-UInt64 identifiers are not queued'
);

SELECT throws_ok(
  $$ INSERT INTO private.archive_clickhouse_graph_purge
       (purge_scope, account_id, archive_upload_id, reason)
     VALUES ('account', '990000000000000101', 7, 'delete_single_archive') $$,
  '23514',
  NULL,
  'scope, upload and reason must agree'
);

SELECT is(
  (SELECT array_agg(column_name::text ORDER BY column_name)
   FROM information_schema.columns
   WHERE table_schema = 'private'
     AND table_name = 'archive_clickhouse_graph_purge'),
  ARRAY[
    'account_id', 'archive_upload_id', 'attempt_count', 'completed_at',
    'created_at', 'id', 'last_error_code', 'next_attempt_at', 'purge_scope',
    'purge_state', 'queued_at', 'reason', 'updated_at'
  ],
  'the outbox stays content-free'
);

SELECT ok(
  NOT has_table_privilege('service_role', 'private.archive_clickhouse_graph_purge', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'private.archive_clickhouse_graph_purge', 'SELECT')
  AND NOT has_table_privilege('anon', 'private.archive_clickhouse_graph_purge', 'SELECT'),
  'API roles cannot read the outbox'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'private.enqueue_archive_clickhouse_graph_purge(text, text, bigint, text)',
    'EXECUTE'
  ),
  'API roles cannot enqueue purges directly'
);

SELECT throws_ok(
  $$ SELECT * FROM private.community_archive_monitoring_graph_purge() $$,
  '42501',
  NULL,
  'backlog aggregates are reserved for the metrics exporter session'
);

SELECT * FROM finish();
ROLLBACK;
