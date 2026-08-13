-- Daily Digest editorial workspace.
--
-- PostgreSQL owns prompt versions, reproducible generation runs, and the
-- publication ledger. ClickHouse remains the rebuildable source for the
-- 24-hour candidate snapshot; the public digest stores immutable tweet
-- snapshots so published pages do not depend on a live analytical query.

create table "public"."digest_prompt_versions" (
    "id" uuid primary key default gen_random_uuid(),
    "version" bigint generated always as identity unique,
    "label" text not null,
    "system_prompt" text not null,
    "user_prompt_template" text not null,
    "model" text not null,
    "parameters" jsonb not null default '{}'::jsonb,
    "created_by" uuid,
    "created_at" timestamptz not null default now(),
    constraint "digest_prompt_versions_label_length" check (char_length(label) between 1 and 120),
    constraint "digest_prompt_versions_system_prompt_length" check (char_length(system_prompt) between 1 and 20000),
    constraint "digest_prompt_versions_user_prompt_length" check (char_length(user_prompt_template) between 1 and 20000),
    constraint "digest_prompt_versions_model_length" check (char_length(model) between 1 and 120),
    constraint "digest_prompt_versions_parameters_object" check (jsonb_typeof(parameters) = 'object')
);

alter table "public"."digest_prompt_versions" owner to "postgres";

create table "public"."digest_runs" (
    "id" uuid primary key default gen_random_uuid(),
    "digest_date" date not null,
    "status" text not null default 'candidates_ready',
    "prompt_version_id" uuid not null references "public"."digest_prompt_versions"("id"),
    "window_start" timestamptz not null,
    "window_end" timestamptz not null,
    "candidates" jsonb not null default '[]'::jsonb,
    "model_request" jsonb,
    "raw_response" jsonb,
    "parsed_output" jsonb,
    "events" jsonb not null default '[]'::jsonb,
    "response_id" text,
    "model" text,
    "input_tokens" integer,
    "output_tokens" integer,
    "total_tokens" integer,
    "duration_ms" integer,
    "error" text,
    "created_by" uuid,
    "created_at" timestamptz not null default now(),
    "started_at" timestamptz,
    "completed_at" timestamptz,
    "updated_at" timestamptz not null default now(),
    constraint "digest_runs_status_check" check (status in ('candidates_ready', 'running', 'completed', 'failed')),
    constraint "digest_runs_window_check" check (window_end > window_start),
    constraint "digest_runs_candidates_array" check (jsonb_typeof(candidates) = 'array'),
    constraint "digest_runs_events_array" check (jsonb_typeof(events) = 'array'),
    constraint "digest_runs_model_request_object" check (model_request is null or jsonb_typeof(model_request) = 'object'),
    constraint "digest_runs_raw_response_object" check (raw_response is null or jsonb_typeof(raw_response) = 'object'),
    constraint "digest_runs_parsed_output_object" check (parsed_output is null or jsonb_typeof(parsed_output) = 'object'),
    constraint "digest_runs_token_counts_nonnegative" check (
      coalesce(input_tokens, 0) >= 0 and coalesce(output_tokens, 0) >= 0 and coalesce(total_tokens, 0) >= 0
    ),
    constraint "digest_runs_duration_nonnegative" check (duration_ms is null or duration_ms >= 0)
);

alter table "public"."digest_runs" owner to "postgres";

create index "digest_runs_date_created_idx"
  on "public"."digest_runs" ("digest_date" desc, "created_at" desc);

create index "digest_runs_prompt_version_idx"
  on "public"."digest_runs" ("prompt_version_id");

create table "public"."digest_editions" (
    "id" uuid primary key default gen_random_uuid(),
    "issue_number" bigint generated always as identity unique,
    "digest_date" date not null,
    "version" integer not null,
    "status" text not null default 'draft',
    "source_run_id" uuid not null references "public"."digest_runs"("id"),
    "content" jsonb not null,
    "created_by" uuid,
    "created_at" timestamptz not null default now(),
    "published_at" timestamptz,
    "updated_at" timestamptz not null default now(),
    constraint "digest_editions_date_version_key" unique ("digest_date", "version"),
    constraint "digest_editions_version_positive" check (version > 0),
    constraint "digest_editions_status_check" check (status in ('draft', 'published', 'archived')),
    constraint "digest_editions_content_object" check (jsonb_typeof(content) = 'object'),
    constraint "digest_editions_publication_time_check" check (
      (status = 'published' and published_at is not null) or status <> 'published'
    )
);

alter table "public"."digest_editions" owner to "postgres";

create unique index "digest_editions_one_published_per_date_idx"
  on "public"."digest_editions" ("digest_date")
  where "status" = 'published';

create index "digest_editions_public_archive_idx"
  on "public"."digest_editions" ("digest_date" desc, "published_at" desc)
  where "status" = 'published';

alter table "public"."digest_prompt_versions" enable row level security;
alter table "public"."digest_runs" enable row level security;
alter table "public"."digest_editions" enable row level security;

-- The editorial tables are service-role only. Published editions are the one
-- intentionally public surface; drafts and generation traces remain private.
revoke all privileges on table "public"."digest_prompt_versions" from "anon", "authenticated";
revoke all privileges on table "public"."digest_runs" from "anon", "authenticated";
revoke all privileges on table "public"."digest_editions" from "anon", "authenticated";

grant all privileges on table "public"."digest_prompt_versions" to "service_role";
grant all privileges on table "public"."digest_runs" to "service_role";
grant all privileges on table "public"."digest_editions" to "service_role";
grant usage, select on sequence "public"."digest_prompt_versions_version_seq" to "service_role";
grant usage, select on sequence "public"."digest_editions_issue_number_seq" to "service_role";

grant select on table "public"."digest_editions" to "anon", "authenticated";

create policy "Published digest editions are publicly readable"
  on "public"."digest_editions"
  for select
  to "anon", "authenticated"
  using ("status" = 'published');

create or replace function "public"."publish_digest_edition"("p_edition_id" uuid)
returns "public"."digest_editions"
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target "public"."digest_editions";
begin
  select *
    into target
    from "public"."digest_editions"
   where id = p_edition_id
   for update;

  if not found then
    raise exception 'Digest edition not found';
  end if;

  if target.status = 'archived' then
    raise exception 'Archived digest editions cannot be published';
  end if;

  update "public"."digest_editions"
     set status = 'archived',
         updated_at = now()
   where digest_date = target.digest_date
     and status = 'published'
     and id <> target.id;

  update "public"."digest_editions"
     set status = 'published',
         published_at = coalesce(published_at, now()),
         updated_at = now()
   where id = target.id
   returning * into target;

  return target;
end;
$$;

revoke execute on function "public"."publish_digest_edition"(uuid) from public, "anon", "authenticated";
grant execute on function "public"."publish_digest_edition"(uuid) to "service_role";

-- Immutable initial prompt. The lab always creates a new version when an
-- editor changes prompts or model parameters.
insert into "public"."digest_prompt_versions" (
  "label",
  "system_prompt",
  "user_prompt_template",
  "model",
  "parameters"
) values (
  'Daily digest baseline',
  'You are the Community Archive daily editor. Group related high-signal tweets into three to five coherent stories. Use mostly the posts themselves and minimal connective prose. Every story keyword must be a short phrase copied verbatim from at least one supplied post; never invent a category label. Include only supplied tweet IDs, never fabricate facts or engagement counts, and preserve meaningful disagreement. Titles should be specific, human, and free of generic AI-newsletter phrasing.',
  E'Create the digest for {{digest_date}} covering {{window_start}} through {{window_end}}.\n\nReturn an executive summary, three to five stories, and a short list of exact keywords found in the supplied posts. A story should aggregate related bangers, not summarize a single post unless it clearly drove the day. Use commentary tweet IDs only when they add context or disagreement.\n\nCandidate snapshot:\n{{candidate_json}}',
  'gpt-5.6-terra',
  '{"reasoning_effort":"low","max_output_tokens":5000}'::jsonb
);

comment on table "public"."digest_prompt_versions" is
  'Immutable prompt and model configurations for reproducible Daily Digest experiments.';
comment on table "public"."digest_runs" is
  'Observable Daily Digest runs with exact candidates, model request/response, parsed output, usage, and event trace.';
comment on table "public"."digest_editions" is
  'Versioned static Daily Digest artifacts. Only rows with status=published are publicly readable.';
