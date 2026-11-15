-- Likes and page views for the Week in Review. Both belong to the week, not to
-- one edition row: the week-so-far edition is replaced (archived) every
-- morning and the final edition then archives the last one, so a like or view
-- recorded on Tuesday's edition must still count on Sunday's and on the final
-- one. Comments do the same by gathering every public edition of the week.
--
-- Reads and writes go through the API's service-role client after session
-- verification, so neither table is exposed to anon or authenticated.

create table if not exists "public"."digest_weekly_likes" (
    "id" uuid primary key default gen_random_uuid(),
    "week_start" date not null,
    "user_id" uuid not null references "auth"."users"("id") on delete cascade,
    "created_at" timestamptz not null default now(),
    constraint "digest_weekly_likes_week_user_key" unique ("week_start", "user_id")
);
alter table "public"."digest_weekly_likes" owner to "postgres";
alter table "public"."digest_weekly_likes" enable row level security;

revoke all privileges on table "public"."digest_weekly_likes" from "anon", "authenticated";
grant all privileges on table "public"."digest_weekly_likes" to "service_role";

create table if not exists "public"."digest_weekly_views" (
    "week_start" date primary key,
    "view_count" bigint not null default 0
      constraint "digest_weekly_views_view_count_nonnegative" check ("view_count" >= 0)
);
alter table "public"."digest_weekly_views" owner to "postgres";
alter table "public"."digest_weekly_views" enable row level security;

revoke all privileges on table "public"."digest_weekly_views" from "anon", "authenticated";
grant all privileges on table "public"."digest_weekly_views" to "service_role";

-- Count one client-rendered visit to a week that has a public edition
-- (running or final). Returns null for a week readers cannot see.
create or replace function "public"."record_digest_weekly_view"(p_week_start date)
returns bigint
language sql
security invoker
set search_path = ''
as $$
  insert into public.digest_weekly_views as views (week_start, view_count)
  select p_week_start, 1
  where exists (
    select 1
    from public.digest_weekly_editions as edition
    where edition.week_start = p_week_start
      and edition.status in ('published', 'in_progress')
  )
  on conflict (week_start)
    do update set view_count = views.view_count + 1
  returning view_count;
$$;
alter function "public"."record_digest_weekly_view"(date) owner to "postgres";
revoke all on function "public"."record_digest_weekly_view"(date) from public, "anon", "authenticated";
grant execute on function "public"."record_digest_weekly_view"(date) to "service_role";
