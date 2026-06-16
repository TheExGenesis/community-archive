-- Harden RLS on extension/worker-only tables and remove cross-user write access.
--
-- Refs:
--   #369  quote_tweets / retweets: RLS disabled + GRANT ALL to anon (anon could DELETE rows)
--   #370  liked_tweets / mentioned_users: uncorrelated "modifiable by their users" policy (IDOR)
--   #372  archive-delete functions still granted to anon (defense-in-depth)
--
-- All of the tables below are written ONLY by the service_role:
--   * community-archive-firehose (SUPABASE_SERVICE_ROLE_KEY)
--   * the archive worker, services/process_archive/process_archive_upload.ts
-- The browser extension posts to the firehose HTTP endpoint, not the DB.
-- So anon / authenticated never need INSERT/UPDATE/DELETE here.

begin;

-- #369 --------------------------------------------------------------------
-- quote_tweets and retweets never had RLS enabled, and inherited GRANT ALL to
-- anon via `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon` (prod.sql).
-- An explicit REVOKE is required to fix the already-created tables (the default-
-- privilege grant only affects future objects). Keep reads public.
alter table public.quote_tweets enable row level security;
alter table public.retweets    enable row level security;

drop policy if exists "Quote tweets are publicly visible" on public.quote_tweets;
drop policy if exists "Retweets are publicly visible"     on public.retweets;
create policy "Quote tweets are publicly visible" on public.quote_tweets for select using (true);
create policy "Retweets are publicly visible"     on public.retweets     for select using (true);

revoke insert, update, delete on public.quote_tweets from anon, authenticated;
revoke insert, update, delete on public.retweets     from anon, authenticated;
grant select on public.quote_tweets to anon, authenticated;
grant select on public.retweets    to anon, authenticated;

-- #370 --------------------------------------------------------------------
-- The "Entities are modifiable by their users" policies on these two global
-- dedup tables only checked that the caller's own provider_id exists in account
-- (no correlation to the row being changed), so any authenticated user could
-- modify any row. Writes happen via the service_role worker, which bypasses RLS,
-- so drop the broken write policies outright. The public "Entities are publicly
-- visible" SELECT policies remain in place.
drop policy if exists "Entities are modifiable by their users" on public.liked_tweets;
drop policy if exists "Entities are modifiable by their users" on public.mentioned_users;

revoke insert, update, delete on public.liked_tweets    from anon, authenticated;
revoke insert, update, delete on public.mentioned_users from anon, authenticated;

-- #372(b) -----------------------------------------------------------------
-- The archive-delete functions already enforce an in-body provider_id ownership
-- check, but anon has no legitimate reason to call them. Mirrors the lockdown in
-- 20260521000000_lock_delete_tweets_grants.sql.
revoke all on function public.delete_user_archive(text)               from anon;
revoke all on function public.delete_single_archive(text, bigint)     from anon;

commit;
