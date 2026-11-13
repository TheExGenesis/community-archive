-- Week so far: every morning after the daily digest, the current week's
-- dailies are woven into a provisional weekly edition that replaces the
-- previous morning's one. It is public with status `in_progress` (at most one
-- per week) and is archived once the final edition for its week publishes.
alter table "public"."digest_weekly_editions"
  drop constraint if exists "digest_weekly_editions_status_check";
alter table "public"."digest_weekly_editions"
  add constraint "digest_weekly_editions_status_check"
  check ("status" in ('running', 'failed', 'draft', 'in_progress', 'published', 'archived'));

alter table "public"."digest_weekly_editions"
  drop constraint if exists "digest_weekly_editions_published_at_check";
alter table "public"."digest_weekly_editions"
  add constraint "digest_weekly_editions_published_at_check"
  check ("status" not in ('published', 'in_progress') or "published_at" is not null);

create unique index if not exists "digest_weekly_editions_one_in_progress_idx"
  on "public"."digest_weekly_editions" ("week_start")
  where "status" = 'in_progress';

drop policy if exists "Published weekly digest editions are publicly readable"
  on "public"."digest_weekly_editions";
create policy "Published weekly digest editions are publicly readable"
  on "public"."digest_weekly_editions"
  for select
  to "anon", "authenticated"
  using ("status" in ('published', 'in_progress'));

-- Health now also covers the week so far, through the same columns:
-- * a failed automated week-so-far run counts as a failed run until a later
--   week-so-far run (or the final edition) for that week succeeds;
-- * once the current week has three dailies published more than three hours
--   ago, a successful week-so-far run must exist within the last 36 hours.
-- Week-so-far failures no longer fall under the final-week failure rule, which
-- would otherwise hold them until the week's final edition.
create or replace function "public"."community_archive_monitoring_weekly_digest"()
returns table (
  "publication_age_seconds" double precision,
  "expected_week_published" double precision,
  "automated_run_failed" double precision,
  "healthy" double precision
)
language sql
stable
security definer
set search_path = ''
as $$
  with expected as (
    select
      (
        date_trunc(
          'week',
          (current_timestamp at time zone 'UTC') - interval '12 hours'
        )::date - 7
      ) as week_start,
      date_trunc('week', current_timestamp at time zone 'UTC')::date
        as current_week_start
  ), latest_published as (
    select edition.week_start, edition.published_at
    from public.digest_weekly_editions as edition
    where edition.status = 'published'
    order by edition.week_start desc
    limit 1
  ), latest_so_far as (
    select edition.status, edition.created_at
    from public.digest_weekly_editions as edition, expected
    where edition.created_by is null
      and edition.workflow_run_id like 'systemd:week-so-far:%'
      and edition.week_start = expected.current_week_start
      and edition.status <> 'running'
    order by edition.created_at desc
    limit 1
  ), state as (
    select
      exists (
        select 1
        from public.digest_weekly_editions as edition
        where edition.status = 'published'
          and edition.week_start = expected.week_start
      ) as expected_published,
      exists (
        select 1
        from public.digest_weekly_editions as edition
        where edition.status = 'failed'
          and edition.created_by is null
          and edition.workflow_run_id like 'systemd:%'
          and edition.workflow_run_id not like 'systemd:week-so-far:%'
          and edition.week_start >= expected.week_start
          and not exists (
            select 1
            from public.digest_weekly_editions as published
            where published.status = 'published'
              and published.week_start = edition.week_start
          )
      ) as run_failed,
      coalesce(
        (select latest_so_far.status = 'failed' from latest_so_far),
        false
      ) as so_far_failed,
      (
        select count(*)
        from public.digest_editions as daily
        where daily.status = 'published'
          and daily.digest_date between expected.current_week_start
            and expected.current_week_start + 6
          and daily.published_at < current_timestamp - interval '3 hours'
      ) >= 3
      and not exists (
        select 1
        from public.digest_weekly_editions as edition
        where edition.created_by is null
          and edition.workflow_run_id like 'systemd:week-so-far:%'
          and edition.week_start = expected.current_week_start
          and edition.status in ('in_progress', 'archived')
          and edition.created_at > current_timestamp - interval '36 hours'
      ) as so_far_stale,
      latest_published.published_at
    from expected
    left join latest_published on true
  )
  select
    coalesce(
      extract(epoch from (current_timestamp - state.published_at)),
      1000000000000
    )::double precision as publication_age_seconds,
    state.expected_published::integer::double precision
      as expected_week_published,
    (state.run_failed or state.so_far_failed)::integer::double precision
      as automated_run_failed,
    (
      state.expected_published
      and not state.run_failed
      and not state.so_far_failed
      and not state.so_far_stale
    )::integer::double precision as healthy
  from state;
$$;
alter function "public"."community_archive_monitoring_weekly_digest"() owner to "postgres";
revoke all on function "public"."community_archive_monitoring_weekly_digest"()
  from public, "anon", "authenticated", "service_role";
grant execute on function "public"."community_archive_monitoring_weekly_digest"()
  to "readclient";
