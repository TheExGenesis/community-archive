BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(11);

-- Start from no alerts, whatever the database holds (rolled back below).
DELETE FROM public.search_alerts;

INSERT INTO auth.users (id, email, aud, role)
VALUES ('00000000-0000-0000-0000-0000000a1e47', 'monitor@example.com', 'authenticated', 'authenticated');

CREATE TEMP VIEW health AS
SELECT * FROM public.community_archive_monitoring_search_alerts();

SELECT is(
  (SELECT row(live_alerts, stalest_check_age_seconds, alerts_with_errors, unsent_email_backlog_age_seconds, healthy)::text FROM health),
  '(0,0,0,0,1)',
  'with no alerts the feature is idle and healthy'
);

SELECT is((SELECT count(*)::int FROM health), 1, 'exactly one row');

-- A live alert last checked four hours ago.
INSERT INTO public.search_alerts (id, user_id, query, last_checked_at, last_error)
VALUES ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-0000000a1e47',
        'stale', current_timestamp - interval '4 hours', 'gateway 502');

SELECT is(
  (SELECT row(live_alerts, stalest_check_age_seconds, alerts_with_errors, healthy)::text FROM health),
  '(1,14400,1,0)',
  'a live alert unchecked for four hours is unhealthy and its error is counted'
);

-- The same alert deleted is ignored.
UPDATE public.search_alerts SET deleted_at = current_timestamp
WHERE id = '00000000-0000-0000-0000-00000000a001';
SELECT is(
  (SELECT row(live_alerts, stalest_check_age_seconds, alerts_with_errors, healthy)::text FROM health),
  '(0,0,0,1)',
  'a deleted stale alert is ignored'
);

-- A freshly checked alert with email on and an unsent two-day-old match.
INSERT INTO public.search_alerts (id, user_id, query, email_enabled, last_checked_at)
VALUES ('00000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-0000000a1e47',
        'emailed', true, current_timestamp - interval '10 minutes');
INSERT INTO public.search_alert_matches (alert_id, user_id, tweet_id, tweet_created_at, created_at)
VALUES ('00000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-0000000a1e47',
        '1001', current_timestamp - interval '2 days', current_timestamp - interval '2 days');

SELECT is(
  (SELECT row(stalest_check_age_seconds, unsent_email_backlog_age_seconds, healthy)::text FROM health),
  '(600,172800,0)',
  'an unsent two-day-old match on an email-enabled alert is unhealthy'
);

UPDATE public.search_alerts SET email_enabled = false
WHERE id = '00000000-0000-0000-0000-00000000a002';
SELECT is(
  (SELECT row(unsent_email_backlog_age_seconds, healthy)::text FROM health),
  '(0,1)',
  'the same match on an alert with email off is ignored'
);

UPDATE public.search_alerts SET email_enabled = true
WHERE id = '00000000-0000-0000-0000-00000000a002';
UPDATE public.search_alert_matches SET created_at = current_timestamp - interval '8 days'
WHERE tweet_id = '1001';
SELECT is(
  (SELECT row(unsent_email_backlog_age_seconds, healthy)::text FROM health),
  '(0,1)',
  'an unsent match older than seven days is ignored (it is never emailed)'
);

UPDATE public.search_alert_matches SET created_at = current_timestamp - interval '30 hours'
WHERE tweet_id = '1001';
SELECT is(
  (SELECT row(unsent_email_backlog_age_seconds, healthy)::text FROM health),
  '(108000,1)',
  'an unsent match younger than 36 hours is still healthy'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.community_archive_monitoring_search_alerts()', 'EXECUTE'),
  'anon cannot execute the health function'
);

SELECT ok(
  NOT has_function_privilege('authenticated', 'public.community_archive_monitoring_search_alerts()', 'EXECUTE'),
  'authenticated cannot execute the health function'
);

SELECT ok(
  has_function_privilege('readclient', 'public.community_archive_monitoring_search_alerts()', 'EXECUTE')
  AND NOT has_function_privilege('service_role', 'public.community_archive_monitoring_search_alerts()', 'EXECUTE'),
  'grants match the digest health functions: readclient only'
);

SELECT * FROM finish();
ROLLBACK;
