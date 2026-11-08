-- Prompt versions are immutable. This adds a new version derived from the
-- LATEST Claude Opus 5.5 prompt by replacing exact sentences, so it composes
-- with other prompt migrations in either order instead of reverting them.
--   1. Executive-summary bullets: at most two stories each, plain words, and
--      name fewer remaining stories rather than cramming a catch-all bullet.
--   2. Titles: exact quote for single-element stories; for stories that combine
--      distinct elements, one coherent headline in the posts' own words that may
--      quote exact excerpts inline.
-- scripts/regenerate-digest-run.ts reads the $old_*$/$new_*$ pairs below to
-- reproduce this prompt locally, so keep each pair adjacent and in this order.
do $$
declare
  source "public"."digest_prompt_versions"%rowtype;
  next_system text;
  next_user text;
  new_label constant text :=
    'All-author community-first nightly digest (Claude Opus 5.5, plain summary, multi-element titles)';
  old_summary constant text := $old_summary$Return exactly three executive-summary bullets, each exactly one short, complete sentence. Aim for 140 characters or fewer per bullet. Never clip a word or leave a sentence unfinished to meet that target. The first two bullets should cover the day's dominant stories. The third bullet must briefly catch the remaining stories when they cannot all be reduced into the first two, so the three bullets collectively account for every story in the edition.$old_summary$;
  new_summary constant text := $new_summary$Return exactly three executive-summary bullets, each exactly one short, complete sentence that a reader who has not seen the stories can understand. Aim for 140 characters or fewer per bullet. Never clip a word or leave a sentence unfinished to meet that target. Each bullet covers one story, or at most two, and says plainly who did what, with a clear subject and verb. Use plain words: no compressed noun piles, stacked modifiers, unexplained jargon, or shorthand labels that only make sense after reading the story (write "a researcher made a model obsessed with owls by training a single neuron", not "one-neuron owls"). The first two bullets cover the day's dominant stories. Use the third bullet for the most important remaining story or two; do not open it with "Also:" and do not try to list every story. When the remaining stories do not fit clearly, name fewer of them: leaving a story out of the summary is better than cramming it in.$new_summary$;
  old_title constant text := $old_title$Copy each title from one supplied post when possible; light paraphrase is acceptable and is never grounds to fail an otherwise valid edition.$old_title$;
  new_title constant text := $new_title$Title each story by what it covers, and make every title read as a coherent headline that makes sense on its own. When a story is about one thing (one claim, event, release, or joke, even if several posts discuss it), copy the title exactly from one supplied post, without adding quotation marks. When a story combines distinct elements (different events, launches, claims, or people's projects), a quote from one post does not cover the others, so write one short headline, under 100 characters, that covers every element and stays as close to the posts' own words as possible. Reuse their phrases, and where that helps quote the two to six most telling words from a post inside the sentence in double quotation marks, never a whole sentence, for example: Someone says "exact words from post A" as someone else asks "exact words from post B". Words inside quotation marks must be copied exactly from a supplied post. The headline must still be one sentence that says who did or said what: never a bare list of quotes or fragments, and never a compressed noun pile; a reader who knows nothing about the day should understand it. Never give a multi-element story a quote that fits only one of its elements. Light paraphrase is never grounds to fail an otherwise valid edition.$new_title$;
  old_user_summary constant text := $old_user_summary$If the stories do not reduce cleanly to three bullets, use bullet three as a compact catch-all that names the remaining stories.$old_user_summary$;
  new_user_summary constant text := $new_user_summary$Write every bullet for someone who has not read the stories: one or two stories per bullet, in plain words. If the remaining stories do not fit clearly in bullet three, name fewer of them rather than cramming them together.$new_user_summary$;
  old_user_title constant text := $old_user_title$a tweet-grounded title$old_user_title$;
  new_user_title constant text := $new_user_title$a tweet-grounded title (an exact excerpt for a single-element story; for a story that combines distinct elements, one coherent headline in the posts' own words, optionally quoting exact excerpts inside the sentence, never a bare list of quotes)$new_user_title$;
begin
  if exists (
    select 1 from "public"."digest_prompt_versions" where "label" = new_label
  ) then
    return;
  end if;

  select * into source
  from "public"."digest_prompt_versions"
  where "model" = 'anthropic/claude-opus-5.5'
  order by "version" desc
  limit 1;

  if not found then
    raise exception 'No Claude Opus 5.5 nightly digest prompt was found';
  end if;
  if strpos(source."system_prompt", old_summary) = 0
    or strpos(source."system_prompt", old_title) = 0
    or strpos(source."user_prompt_template", old_user_summary) = 0
    or strpos(source."user_prompt_template", old_user_title) = 0
  then
    raise exception 'Latest Opus 5.5 digest prompt (version %) lacks a sentence this migration replaces', source."version";
  end if;

  next_system := replace(
    replace(source."system_prompt", old_summary, new_summary),
    old_title,
    new_title
  );
  next_user := replace(
    replace(source."user_prompt_template", old_user_summary, new_user_summary),
    old_user_title,
    new_user_title
  );

  insert into "public"."digest_prompt_versions" (
    "label",
    "system_prompt",
    "user_prompt_template",
    "model",
    "parameters"
  ) values (
    new_label,
    next_system,
    next_user,
    source."model",
    source."parameters"
  );
end
$$;
