BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(2);

SELECT throws_ok(
  $$ SELECT * FROM private.community_archive_monitoring_members_week(26) $$,
  '42501',
  NULL,
  'weekly member joins are reserved for the metrics exporter session'
);

SELECT ok(
  NOT has_function_privilege(
    'anon', 'private.community_archive_monitoring_members_week(integer)', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated', 'private.community_archive_monitoring_members_week(integer)', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role', 'private.community_archive_monitoring_members_week(integer)', 'EXECUTE'
  ),
  'API roles cannot execute the weekly member joins'
);

SELECT * FROM finish();
ROLLBACK;
