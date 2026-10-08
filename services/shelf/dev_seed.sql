-- LOCAL DEVELOPMENT ONLY. Makes the two phase accounts current members in a local Supabase so
-- bulletin.allowed_accounts (and therefore get_shelf) admits them. Never run against staging
-- or production: real membership comes from real uploads and opt-ins.
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f dev_seed.sql
DO $$
BEGIN
  -- A real database has thousands of accounts; a fresh local one has (almost) none.
  IF (SELECT count(*) FROM public.all_account) > 100 THEN
    RAISE EXCEPTION 'dev_seed.sql is for empty local databases only';
  END IF;
END $$;

INSERT INTO public.all_account(account_id, created_via, username, created_at, account_display_name,
                               num_tweets, num_followers)
VALUES ('815615492429754369', 'twitter_import', 'maskys_', '2017-01-01T17:47:41Z', 'Kifah', 2678, 557),
       ('370323535', 'twitter_import', 'GarrisonLovely', '2011-09-08T00:00:00Z', 'Garrison Lovely', 7075, 11431)
ON CONFLICT DO NOTHING;

INSERT INTO public.optin(username, twitter_user_id, opted_in, opted_in_at)
SELECT v.username, v.id, true, now()
FROM (VALUES ('maskys_', '815615492429754369'), ('GarrisonLovely', '370323535')) AS v(username, id)
WHERE NOT EXISTS (SELECT 1 FROM public.optin o WHERE o.twitter_user_id = v.id);

SELECT account_id FROM bulletin.allowed_accounts
WHERE account_id IN ('815615492429754369', '370323535');
