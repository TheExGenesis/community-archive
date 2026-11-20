BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(12);

INSERT INTO auth.users (id, email, aud, role)
VALUES ('00000000-0000-0000-0000-00000000a1e1', 'alerts@example.com', 'authenticated', 'authenticated');

INSERT INTO public.search_alerts (user_id, query)
SELECT '00000000-0000-0000-0000-00000000a1e1', 'query ' || g FROM generate_series(1, 10) g;

SELECT throws_ok(
  $$ INSERT INTO public.search_alerts (user_id, query)
     VALUES ('00000000-0000-0000-0000-00000000a1e1', 'eleventh') $$,
  'P0001',
  'search alert limit reached',
  'an eleventh live alert is refused'
);

UPDATE public.search_alerts SET deleted_at = now()
WHERE query = 'query 10';
SELECT lives_ok(
  $$ INSERT INTO public.search_alerts (user_id, query)
     VALUES ('00000000-0000-0000-0000-00000000a1e1', 'replacement') $$,
  'deleted alerts do not count toward the cap'
);

CREATE TEMP TABLE t_alert AS
SELECT id, last_checked_at FROM public.search_alerts WHERE query = 'query 1';

SELECT ok(
  public.record_search_alert_check(
    (SELECT id FROM t_alert), (SELECT last_checked_at FROM t_alert),
    (SELECT last_checked_at FROM t_alert) + interval '1 hour',
    '[{"id":"30"},{"id":"20"}]', 2),
  'a check from the current watermark is recorded'
);

SELECT ok(
  NOT public.record_search_alert_check(
    (SELECT id FROM t_alert), (SELECT last_checked_at FROM t_alert),
    (SELECT last_checked_at FROM t_alert) + interval '2 hours',
    '[{"id":"99"}]', 1),
  'a check from a stale watermark writes nothing'
);

SELECT ok(
  public.record_search_alert_check(
    (SELECT id FROM t_alert), (SELECT last_checked_at FROM t_alert) + interval '1 hour',
    (SELECT last_checked_at FROM t_alert) + interval '2 hours',
    '[{"id":"50"},{"id":"45"},{"id":"44"},{"id":"43"}]', 4),
  'the next check is recorded'
);

SELECT is(
  (SELECT count(*)::int FROM public.notifications WHERE alert_id = (SELECT id FROM t_alert)),
  1,
  'later checks add to the one unread notification'
);

SELECT is(
  (SELECT payload FROM public.notifications WHERE alert_id = (SELECT id FROM t_alert)),
  jsonb_build_object(
    'count', 6,
    'tweetIds', '["50","45","44","43","30"]'::jsonb,
    'since', to_jsonb((SELECT last_checked_at FROM t_alert)),
    'latestAt', to_jsonb((SELECT last_checked_at FROM t_alert) + interval '2 hours')
  ),
  'the payload sums counts, keeps the five newest ids and the first boundary'
);

SELECT is(
  (SELECT last_seen_tweet_id FROM public.search_alerts WHERE id = (SELECT id FROM t_alert)),
  '50',
  'the watermark tweet is the newest match'
);

UPDATE public.notifications SET read_at = now() WHERE alert_id = (SELECT id FROM t_alert);
SELECT public.record_search_alert_check(
  (SELECT id FROM t_alert), (SELECT last_checked_at FROM t_alert) + interval '2 hours',
  (SELECT last_checked_at FROM t_alert) + interval '3 hours', '[{"id":"60"}]', 1);
SELECT is(
  (SELECT count(*)::int FROM public.notifications WHERE alert_id = (SELECT id FROM t_alert) AND read_at IS NULL),
  1,
  'a match after reading starts a new unread notification'
);

SELECT is(
  public.claim_search_alert_email('00000000-0000-0000-0000-00000000a1e1'),
  NULL,
  'nothing is claimed while email is off'
);

UPDATE public.search_alerts SET email_enabled = true WHERE id = (SELECT id FROM t_alert);
SELECT ok(
  public.claim_search_alert_email('00000000-0000-0000-0000-00000000a1e1') IS NOT NULL
  AND public.claim_search_alert_email('00000000-0000-0000-0000-00000000a1e1') IS NULL,
  'claimed matches are never claimed by a second email'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.search_alerts', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.notifications', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.search_alert_email_sends', 'SELECT')
  AND NOT has_function_privilege('authenticated', 'public.claim_search_alert_email(uuid, interval)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.record_search_alert_check(uuid, timestamptz, timestamptz, jsonb, integer)', 'EXECUTE'),
  'alert tables and functions are service-role only'
);

SELECT * FROM finish();
ROLLBACK;
