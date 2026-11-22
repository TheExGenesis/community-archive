BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(2);

SELECT throws_ok(
  $$ SELECT * FROM private.community_archive_monitoring_public_api_keys() $$,
  '42501',
  NULL,
  'key aggregates are reserved for the metrics exporter session'
);

SELECT ok(
  NOT has_function_privilege(
    'anon', 'private.community_archive_monitoring_public_api_keys()', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated', 'private.community_archive_monitoring_public_api_keys()', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role', 'private.community_archive_monitoring_public_api_keys()', 'EXECUTE'
  ),
  'API roles cannot execute the key aggregates'
);

SELECT * FROM finish();
ROLLBACK;
