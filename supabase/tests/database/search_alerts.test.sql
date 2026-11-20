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

UPDATE public.search_alerts SET created_at = '2026-11-15T00:00:00Z'
WHERE query = 'query 1';
CREATE TEMP TABLE t_alert AS
SELECT id FROM public.search_alerts WHERE query = 'query 1';

SELECT is(
  public.record_search_alert_check(
    (SELECT id FROM t_alert), '2026-11-20T10:00:00Z',
    '[{"id":"30","createdAt":"2026-11-20T09:30:00Z"},
      {"id":"20","replyToId":"7","createdAt":"2026-11-20T08:30:00Z"},
      {"id":"5","createdAt":"2026-11-14T08:00:00Z"}]'),
  2,
  'new tweets are recorded; one created before the alert is not'
);

SELECT is(
  public.record_search_alert_check(
    (SELECT id FROM t_alert), '2026-11-20T11:00:00Z',
    '[{"id":"30","createdAt":"2026-11-20T09:30:00Z"},
      {"id":"20","createdAt":"2026-11-20T08:30:00Z"},
      {"id":"15","createdAt":"2026-11-19T22:00:00Z"}]'),
  1,
  'a late-arriving tweet created before the last check is new; seen ones are not'
);

SELECT is(
  public.record_search_alert_check(
    (SELECT id FROM t_alert), '2026-11-20T12:00:00Z',
    '[{"id":"30","createdAt":"2026-11-20T09:30:00Z"},
      {"id":"15","createdAt":"2026-11-19T22:00:00Z"}]'),
  0,
  'a re-run reports nothing'
);

SELECT is(
  (SELECT count(*)::int FROM public.notifications WHERE alert_id = (SELECT id FROM t_alert)),
  1,
  'later checks add to the one unread notification'
);

SELECT is(
  (SELECT jsonb_build_object('count', payload -> 'count', 'tweetIds', payload -> 'tweetIds')
   FROM public.notifications WHERE alert_id = (SELECT id FROM t_alert)),
  '{"count": 3, "tweetIds": ["15", "30", "20"]}'::jsonb,
  'the payload counts only inserted tweets, newest batch first'
);

SELECT is(
  public.record_search_alert_check(gen_random_uuid(), now(), '[]'),
  -1,
  'a missing alert is reported as such'
);

UPDATE public.notifications SET read_at = now() WHERE alert_id = (SELECT id FROM t_alert);
SELECT public.record_search_alert_check(
  (SELECT id FROM t_alert), '2026-11-20T13:00:00Z',
  '[{"id":"60","createdAt":"2026-11-20T12:30:00Z"}]');
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
  AND NOT has_function_privilege('anon', 'public.record_search_alert_check(uuid, timestamptz, jsonb)', 'EXECUTE'),
  'alert tables and functions are service-role only'
);

SELECT * FROM finish();
ROLLBACK;
