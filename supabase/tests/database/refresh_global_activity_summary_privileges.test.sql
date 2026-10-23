BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(5);

SELECT ok(
  NOT has_function_privilege('anon', 'public.refresh_global_activity_summary()', 'EXECUTE'),
  'anon cannot start a global activity summary refresh'
);

SELECT ok(
  NOT has_function_privilege('authenticated', 'public.refresh_global_activity_summary()', 'EXECUTE'),
  'authenticated cannot start a global activity summary refresh'
);

SELECT ok(
  has_function_privilege('service_role', 'public.refresh_global_activity_summary()', 'EXECUTE'),
  'service_role can start a global activity summary refresh'
);

SELECT is(
  (SELECT username::text FROM cron.job WHERE jobname = 'refresh-global-activity-summary-daily'),
  'postgres',
  'the daily refresh cron job runs as postgres'
);

SELECT ok(
  has_function_privilege(
    (SELECT username::text FROM cron.job WHERE jobname = 'refresh-global-activity-summary-daily'),
    'public.refresh_global_activity_summary()',
    'EXECUTE'
  ),
  'the daily refresh cron job owner can execute the refresh'
);

SELECT * FROM finish();
ROLLBACK;
