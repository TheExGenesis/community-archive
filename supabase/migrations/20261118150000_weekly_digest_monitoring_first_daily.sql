-- The week-so-far edition now starts with the week's first daily (Monday
-- morning) instead of the third. Health therefore expects a successful
-- week-so-far run once one of the running week's dailies is three hours old,
-- not three. Everything else is unchanged from 20261112090000.
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
      ) >= 1
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
