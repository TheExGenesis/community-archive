BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(14);

INSERT INTO public.optin (
  username,
  opted_in,
  opted_in_at
) VALUES (
  '__pgtap_optin_insert',
  true,
  '2000-01-01 00:00:00+00'
);

SELECT is(
  (SELECT opted_in FROM public.optin WHERE username = '__pgtap_optin_insert'),
  true,
  'opted-in inserts remain opted in'
);

SELECT is(
  (SELECT opted_in_at FROM public.optin WHERE username = '__pgtap_optin_insert'),
  (SELECT updated_at FROM public.optin WHERE username = '__pgtap_optin_insert'),
  'opted-in inserts receive a server-controlled timestamp'
);

UPDATE public.optin
SET opted_in_at = '2001-01-01 00:00:00+00'
WHERE username = '__pgtap_optin_insert';

SELECT is(
  (SELECT opted_in_at FROM public.optin WHERE username = '__pgtap_optin_insert'),
  (SELECT updated_at FROM public.optin WHERE username = '__pgtap_optin_insert'),
  'same-state opted-in updates cannot rewrite the server timestamp'
);

INSERT INTO public.optin (
  username,
  opted_in,
  explicit_optout,
  opted_out_at
) VALUES (
  '__pgtap_explicit_optout_insert',
  true,
  true,
  '2000-01-01 00:00:00+00'
);

SELECT is(
  (SELECT opted_in FROM public.optin WHERE username = '__pgtap_explicit_optout_insert'),
  false,
  'explicit opt-out overrides a simultaneous inserted opt-in'
);

SELECT is(
  (SELECT opted_out_at FROM public.optin WHERE username = '__pgtap_explicit_optout_insert'),
  (SELECT updated_at FROM public.optin WHERE username = '__pgtap_explicit_optout_insert'),
  'explicit opt-out inserts receive a server-controlled timestamp'
);

UPDATE public.optin
SET opted_out_at = '2001-01-01 00:00:00+00'
WHERE username = '__pgtap_explicit_optout_insert';

SELECT is(
  (SELECT opted_out_at FROM public.optin WHERE username = '__pgtap_explicit_optout_insert'),
  (SELECT updated_at FROM public.optin WHERE username = '__pgtap_explicit_optout_insert'),
  'same-state explicit opt-outs cannot rewrite the server timestamp'
);

UPDATE public.optin
SET
  opted_in = true,
  explicit_optout = false,
  opt_out_reason = 'stale reason'
WHERE username = '__pgtap_explicit_optout_insert';

SELECT is(
  (
    SELECT opted_in
      AND explicit_optout IS FALSE
      AND opted_out_at IS NULL
      AND opt_out_reason IS NULL
    FROM public.optin
    WHERE username = '__pgtap_explicit_optout_insert'
  ),
  true,
  'false-to-true transitions clear opt-out state'
);

SELECT is(
  (
    SELECT opted_in_at = updated_at
    FROM public.optin
    WHERE username = '__pgtap_explicit_optout_insert'
  ),
  true,
  'false-to-true transitions record the opt-in time'
);

UPDATE public.optin
SET opted_in = false
WHERE username = '__pgtap_explicit_optout_insert';

SELECT is(
  (
    SELECT opted_out_at = updated_at
    FROM public.optin
    WHERE username = '__pgtap_explicit_optout_insert'
  ),
  true,
  'true-to-false transitions record the opt-out time'
);

ALTER TABLE public.optin DISABLE TRIGGER update_optin_timestamp;

INSERT INTO public.optin (username, opted_in, created_at, updated_at)
VALUES
  ('__pgtap_legacy_repair', true, '2020-01-01 00:00:00+00', '2020-01-01 00:00:00+00'),
  ('__pgtap_legacy_backfill', true, '2021-01-01 00:00:00+00', '2021-01-01 00:00:00+00'),
  (
    '__pgtap_preserved_timestamp',
    true,
    '2022-01-01 00:00:00+00',
    '2022-01-01 00:00:00+00'
  ),
  ('__pgtap_opted_out', false, '2023-01-01 00:00:00+00', '2023-01-01 00:00:00+00');

UPDATE public.optin
SET opted_in_at = '2019-01-01 00:00:00+00'
WHERE username = '__pgtap_preserved_timestamp';

ALTER TABLE public.optin ENABLE TRIGGER update_optin_timestamp;

UPDATE public.optin
SET username = username
WHERE username = '__pgtap_legacy_repair';

SELECT is(
  (
    SELECT opted_in_at = created_at
    FROM public.optin
    WHERE username = '__pgtap_legacy_repair'
  ),
  true,
  'legacy opted-in rows self-repair on their next update'
);

ALTER TABLE public.optin DISABLE TRIGGER update_optin_timestamp;

UPDATE public.optin
SET opted_in_at = COALESCE(created_at, updated_at, NOW())
WHERE opted_in IS TRUE
  AND opted_in_at IS NULL;

ALTER TABLE public.optin ENABLE TRIGGER update_optin_timestamp;

SELECT is(
  (
    SELECT opted_in_at = created_at
    FROM public.optin
    WHERE username = '__pgtap_legacy_backfill'
  ),
  true,
  'the backfill fills legacy opted-in rows from their creation time'
);

SELECT is(
  (
    SELECT updated_at = '2021-01-01 00:00:00+00'::timestamptz
    FROM public.optin
    WHERE username = '__pgtap_legacy_backfill'
  ),
  true,
  'the backfill preserves the historical updated-at time'
);

SELECT is(
  (
    SELECT opted_in_at = '2019-01-01 00:00:00+00'::timestamptz
    FROM public.optin
    WHERE username = '__pgtap_preserved_timestamp'
  ),
  true,
  'the backfill preserves existing opt-in timestamps'
);

SELECT is(
  (
    SELECT opted_in_at IS NULL
    FROM public.optin
    WHERE username = '__pgtap_opted_out'
  ),
  true,
  'the backfill leaves opted-out rows unchanged'
);

SELECT * FROM finish();

ROLLBACK;
