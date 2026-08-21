-- Vercel cron delivery is best effort and may be duplicated. Automated runs
-- are system-owned, top-level workflow runs; keep one immutable run per date.
create unique index if not exists "digest_runs_one_nightly_run_per_date_idx"
  on "public"."digest_runs" ("digest_date")
  where "created_by" is null
    and "parent_run_id" is null
    and "workflow_run_id" is not null;

-- Keep all-author reach while making Community Archive authorship an explicit
-- editorial signal. Prompt versions are immutable, so this is a new version.
insert into "public"."digest_prompt_versions" (
  "label",
  "system_prompt",
  "user_prompt_template",
  "model",
  "parameters"
) values (
  'All-author community-first nightly digest',
  $system_prompt$You are the Community Archive daily editor. Turn the supplied, zero-indexed tweet corpus into a concise, faithful daily edition. Group related bangers into three to five coherent stories, use the posts' own language whenever it is clear, and add only the minimum prose needed to explain what happened.

Every banger includes an authored_by_community_member boolean. Treat Community Archive authorship as a strong editorial preference, not an exclusion rule. Prefer coherent, relevant stories anchored by community-authored bangers. Include bangers by other authors when they are unusually big, especially relevant to the community's conversation, or needed because the community-authored bangers do not support enough strong stories. Never infer membership from a username or the post text; use only the supplied boolean.

Return exactly three executive-summary bullets, each exactly one short, complete sentence. Aim for 140 characters or fewer per bullet. Never clip a word or leave a sentence unfinished to meet that target. The first two bullets should cover the day's dominant stories. The third bullet must briefly catch the remaining stories when they cannot all be reduced into the first two, so the three bullets collectively account for every story in the edition.

Choose the most representative or iconic tweet for the day. Index 0 is the strongest-ranked banger and is the default, but choose another corpus index when it better represents the edition. Prefer a community-authored representative when it is comparably strong and representative.

For every story, choose one loose editorial label from the allowed category list. Before labeling a literal-sounding claim as news, evaluate tone, absurdity, source credibility, sarcasm, reply and quote-post context, and the post's likely social function. If a claim is a joke, satire, or a shitpost, classify and explain it as a Viral joke or Meme rather than reporting it as fact. Never turn a joke into a breaking-news assertion. If intent is genuinely ambiguous, say so in the editorial note.

Copy each title from one supplied post when possible; light paraphrase is acceptable and is never grounds to fail an otherwise valid edition. Make each subtitle one complete explanatory sentence that supplies the people, event, and significance the title leaves unstated. Prefer concise prose, but do not target a fixed character count and never clip, truncate, or leave a subtitle unfinished for length. Preserve disagreement and uncertainty. Keywords must be short exact phrases that occur in the corpus. Refer to tweets only by zero-based corpus indices. Never invent a tweet, fact, quotation, engagement count, membership status, or index.$system_prompt$,
  $user_prompt$Create the digest for {{digest_date}} covering {{window_start}} through {{window_end}}.

Use only the indexed corpus below. It contains qualifying bangers from all authors and marks community-authored bangers with authored_by_community_member. Build three to five stories. Prefer stories anchored in community-authored bangers when they are coherent and relevant, but include non-community stories when they are unusually big, especially relevant, or necessary because the community-authored material is not enough. Down-weight generic pop culture unless it is genuinely dominant or meaningfully connected to the community's conversation.

Every story must include at least one banger index; add reply or quote indices when they clarify the surrounding conversation. Return exactly three complete, one-sentence executive-summary bullets. Aim for 140 characters or fewer and never truncate text. If the stories do not reduce cleanly to three bullets, use bullet three as a compact catch-all that names the remaining stories. For each story, return its loose category, a tweet-grounded title, one complete explanatory subtitle with no forced character target, one to three In brief bullets, an editor note, and the selected tweet indices. Never clip or truncate a subtitle. Return three to twelve exact keywords from the corpus.

Indexed corpus:
{{candidate_json}}$user_prompt$,
  'deepseek/deepseek-v4-flash-0731',
  '{"reasoning_effort":"high","max_output_tokens":6000,"temperature":0.2}'::jsonb
);

-- Expose only aggregate nightly-publication health to the least-privilege
-- monitoring role. Generation inputs, prompts, errors, and drafts stay private.
create or replace function "public"."community_archive_monitoring_digest"()
returns table (
  "publication_age_seconds" double precision,
  "expected_date_published" double precision,
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
      ((current_timestamp at time zone 'UTC') - interval '30 hours')::date
        as digest_date,
      (current_timestamp at time zone 'UTC') as checked_at
  ), latest_published as (
    select edition.digest_date, edition.published_at
    from public.digest_editions as edition
    where edition.status = 'published'
    order by edition.digest_date desc, edition.version desc
    limit 1
  ), state as (
    select
      expected.digest_date as expected_date,
      expected.checked_at,
      latest_published.digest_date as published_date,
      latest_published.published_at,
      exists (
        select 1
        from public.digest_runs as run
        where run.digest_date = expected.digest_date
          and run.status = 'failed'
          and run.created_by is null
          and run.parent_run_id is null
          and run.workflow_run_id is not null
      ) as run_failed
    from expected
    left join latest_published on true
  )
  select
    coalesce(
      extract(epoch from (current_timestamp - state.published_at)),
      1000000000000
    )::double precision as publication_age_seconds,
    coalesce(state.published_date = state.expected_date, false)::integer::double precision
      as expected_date_published,
    state.run_failed::integer::double precision as automated_run_failed,
    (
      case
        when state.published_date = state.expected_date then 1
        when state.run_failed then 0
        when state.checked_at < state.expected_date::timestamp + interval '32 hours'
          then 1
        else 0
      end
    )::double precision as healthy
  from state;
$$;
alter function "public"."community_archive_monitoring_digest"() owner to "postgres";
revoke all on function "public"."community_archive_monitoring_digest"()
  from public, "anon", "authenticated", "service_role";
grant execute on function "public"."community_archive_monitoring_digest"()
  to "readclient";
