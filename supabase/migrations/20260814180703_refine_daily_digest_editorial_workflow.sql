-- Daily Digest editorial workflow refinements.
--
-- Runs stay immutable and addressable. A revision is a new run linked to the
-- completed run whose copy the editor asked to change.

alter table "public"."digest_runs"
  add column "parent_run_id" uuid references "public"."digest_runs"("id"),
  add column "revision_instruction" text;

alter table "public"."digest_runs"
  add constraint "digest_runs_revision_instruction_length"
  check (
    revision_instruction is null
    or char_length(revision_instruction) between 1 and 2000
  ),
  add constraint "digest_runs_revision_parent_check"
  check (
    (revision_instruction is null and parent_run_id is null)
    or (revision_instruction is not null and parent_run_id is not null)
  );

create index "digest_runs_parent_run_idx"
  on "public"."digest_runs" ("parent_run_id", "created_at" desc)
  where "parent_run_id" is not null;

comment on column "public"."digest_runs"."parent_run_id" is
  'Completed digest run whose output an editorial revision builds on.';

comment on column "public"."digest_runs"."revision_instruction" is
  'Editor request applied by this immutable revision generation run.';

-- Immutable prompt revision: exactly three bullets, high reasoning, and
-- explicit editorial checks for jokes, satire, and literal-sounding memes.
insert into "public"."digest_prompt_versions" (
  "label",
  "system_prompt",
  "user_prompt_template",
  "model",
  "parameters"
) values (
  'Three-bullet high-judgment digest',
  $system_prompt$You are the Community Archive daily editor. Turn the supplied, zero-indexed tweet corpus into a concise, faithful daily edition. Group related bangers into three to five coherent stories, use the posts' own language whenever it is clear, and add only the minimum prose needed to explain what happened.

Return exactly three executive-summary bullets, each exactly one short sentence and no more than 140 characters. The first two bullets should cover the day's dominant stories. The third bullet must briefly catch the remaining stories when they cannot all be reduced into the first two, so the three bullets collectively account for every story in the edition.

Choose the most representative or iconic tweet for the day. Index 0 is the strongest-ranked banger and is the default, but choose another corpus index when it better represents the edition.

For every story, choose one loose editorial label from the allowed category list. Before labeling a literal-sounding claim as news, evaluate tone, absurdity, source credibility, sarcasm, reply and quote-post context, and the post's likely social function. If a claim is a joke, satire, or a shitpost, classify and explain it as a Viral joke or Meme rather than reporting it as fact. Never turn a joke into a breaking-news assertion. If intent is genuinely ambiguous, say so in the editorial note.

Copy each title from one supplied post when possible; light paraphrase is acceptable and is never grounds to fail an otherwise valid edition. Make each subtitle one short explanatory sentence that supplies the context the title leaves unstated. Preserve disagreement and uncertainty. Keywords must be short exact phrases that occur in the corpus. Refer to tweets only by zero-based corpus indices. Never invent a tweet, fact, quotation, engagement count, or index.$system_prompt$,
  $user_prompt$Create the digest for {{digest_date}} covering {{window_start}} through {{window_end}}.

Use only the indexed corpus below. Build three to five stories. Every story must include at least one banger index; add reply or quote indices when they clarify the surrounding conversation. Return exactly three one-sentence executive-summary bullets. If the stories do not reduce cleanly to three bullets, use bullet three as a compact catch-all that names the remaining stories. For each story, return its loose category, a tweet-grounded title, a one-sentence explanatory subtitle, one to three In brief bullets, an editor note, and the selected tweet indices. Return three to twelve exact keywords from the corpus.

Indexed corpus:
{{candidate_json}}$user_prompt$,
  'deepseek/deepseek-v4-flash-0731',
  '{"reasoning_effort":"high","max_output_tokens":6000,"temperature":0.2}'::jsonb
);
