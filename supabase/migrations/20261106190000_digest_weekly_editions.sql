-- Weekly Digest: one edition per Monday–Sunday week, woven from that week's
-- published daily editions (and continuity with the previous two weekly
-- editions). Each row is one generation attempt; only `published` rows are
-- public. Prompts, raw responses and errors stay service-role only.
create table if not exists "public"."digest_weekly_editions" (
    "id" uuid primary key default gen_random_uuid(),
    "week_start" date not null,
    "status" text not null default 'running',
    "content" jsonb,
    "source_edition_ids" uuid[] not null default '{}',
    "prior_week_edition_ids" uuid[] not null default '{}',
    "workflow_run_id" text,
    "model" text,
    "model_request" jsonb,
    "raw_response" jsonb,
    "input_tokens" integer,
    "output_tokens" integer,
    "duration_ms" integer,
    "error" text,
    "created_by" uuid,
    "created_at" timestamptz not null default now(),
    "published_at" timestamptz,
    "updated_at" timestamptz not null default now(),
    constraint "digest_weekly_editions_monday_check"
      check (extract(isodow from "week_start") = 1),
    constraint "digest_weekly_editions_status_check"
      check ("status" in ('running', 'failed', 'draft', 'published', 'archived')),
    constraint "digest_weekly_editions_content_check"
      check ("status" in ('running', 'failed') or jsonb_typeof("content") = 'object'),
    constraint "digest_weekly_editions_published_at_check"
      check ("status" <> 'published' or "published_at" is not null)
);

alter table "public"."digest_weekly_editions" owner to "postgres";

-- At most one public edition per week.
create unique index if not exists "digest_weekly_editions_one_published_idx"
  on "public"."digest_weekly_editions" ("week_start")
  where "status" = 'published';

-- A retried timer never repeats a model call for the same automated run ID.
create unique index if not exists "digest_weekly_editions_workflow_run_idx"
  on "public"."digest_weekly_editions" ("workflow_run_id")
  where "workflow_run_id" is not null;

create index if not exists "digest_weekly_editions_published_week_idx"
  on "public"."digest_weekly_editions" ("week_start" desc)
  where "status" = 'published';

alter table "public"."digest_weekly_editions" enable row level security;

revoke all privileges on table "public"."digest_weekly_editions"
  from "anon", "authenticated";
grant all privileges on table "public"."digest_weekly_editions" to "service_role";
grant select ("id", "week_start", "status", "content", "published_at")
  on table "public"."digest_weekly_editions" to "anon", "authenticated";

drop policy if exists "Published weekly digest editions are publicly readable"
  on "public"."digest_weekly_editions";
create policy "Published weekly digest editions are publicly readable"
  on "public"."digest_weekly_editions"
  for select
  to "anon", "authenticated"
  using ("status" = 'published');

-- Aggregate-only health for the least-privilege monitoring role. The weekly
-- timer runs Monday 09:00 UTC; the edition for the week that ended on Sunday
-- is due by Monday 12:00 UTC. Before that deadline the previous week is the
-- expected one, so a fresh deployment is healthy once the latest completed week
-- is published.
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
    select (
      date_trunc(
        'week',
        (current_timestamp at time zone 'UTC') - interval '12 hours'
      )::date - 7
    ) as week_start
  ), latest_published as (
    select edition.week_start, edition.published_at
    from public.digest_weekly_editions as edition
    where edition.status = 'published'
    order by edition.week_start desc
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
          and edition.week_start >= expected.week_start
          and not exists (
            select 1
            from public.digest_weekly_editions as published
            where published.status = 'published'
              and published.week_start = edition.week_start
          )
      ) as run_failed,
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
    state.run_failed::integer::double precision as automated_run_failed,
    (state.expected_published and not state.run_failed)::integer::double precision
      as healthy
  from state;
$$;
alter function "public"."community_archive_monitoring_weekly_digest"() owner to "postgres";
revoke all on function "public"."community_archive_monitoring_weekly_digest"()
  from public, "anon", "authenticated", "service_role";
grant execute on function "public"."community_archive_monitoring_weekly_digest"()
  to "readclient";

-- Opt-out precedence. `tombstone_policy_account` archives any daily edition
-- whose snapshot contains a blocked author. A weekly edition is derived text
-- and tweet snapshots from its daily sources, so it follows them: when a
-- source daily is tombstoned, the weekly edition is archived with the same
-- tombstone shape and its private prompt/response copies are dropped. Later
-- weeks that used it only as continuity context keep their own content but
-- lose the private prompt copy that quoted it.
create or replace function "private"."tombstone_weekly_digests_for_daily"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  archived_ids uuid[];
begin
  with archived as (
    update public.digest_weekly_editions as weekly
       set status = 'archived',
           published_at = null,
           content = jsonb_build_object(
             'policy_tombstone', true,
             'source_edition_id', new.id
           ),
           model_request = null,
           raw_response = null,
           error = null,
           updated_at = now()
     where new.id = any(weekly.source_edition_ids)
       and not coalesce(weekly.content ? 'policy_tombstone', false)
    returning weekly.id
  )
  select coalesce(array_agg(id), '{}') into archived_ids from archived;

  if cardinality(archived_ids) > 0 then
    update public.digest_weekly_editions as weekly
       set model_request = null,
           raw_response = null,
           updated_at = now()
     where weekly.prior_week_edition_ids && archived_ids;
  end if;
  return new;
end;
$$;
alter function "private"."tombstone_weekly_digests_for_daily"() owner to "postgres";
revoke all on function "private"."tombstone_weekly_digests_for_daily"()
  from public, "anon", "authenticated", "service_role";

drop trigger if exists "tombstone_weekly_digests_for_daily"
  on "public"."digest_editions";
create trigger "tombstone_weekly_digests_for_daily"
  after update of "content" on "public"."digest_editions"
  for each row
  when (new.content ? 'policy_tombstone' and not coalesce(old.content ? 'policy_tombstone', false))
  execute function "private"."tombstone_weekly_digests_for_daily"();
