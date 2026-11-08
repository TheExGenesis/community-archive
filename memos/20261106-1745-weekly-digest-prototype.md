# Weekly Digest prototype

## What it is

A weekly edition built from the **published daily editions** of one Monday–Sunday
week. It does not read ClickHouse or re-rank tweets, so every weekly claim traces
back to a daily story. One structured Opus 5.5 call per week (via OpenRouter),
plus at most one repair call if validation fails.

- Code: `src/lib/digest/weekly.ts` (prompt, schema, validation, Markdown),
  `src/lib/digest/weeklyGeneration.ts` (model call + repair loop),
  `scripts/generate-weekly-digest.ts` (local runner).
- `generateDigestWithModel` now takes an optional `responseFormat`; the
  daily digest still gets its existing schema by default.
- Local only: reads published editions through the public anon API, writes files.
  No table, page, timer, or production write yet.

## Editorial rules

- 4–7 stories of two kinds. **major**: most important or most engaged-with, even
  if it was on one day. **ongoing**: the same subject on at least two dates,
  consecutive or not. The validator rejects an "ongoing" story with one date.
- Daily stories are bundled only when they share a concrete subject (same event,
  people, release, claim, or a direct reply). A shared theme isn't enough. Any
  story that bundles daily stories must fill in `connection`, which says what links
  them, or validation fails.
- **Continuity**: the prompt includes the previous two weekly editions. A story
  that continues one lists it in `continues_from` and must give a
  `continuity_note` saying what is new this week. Refs are validated.
- Summary: three bullets of at most 200 characters (validated), one lead story
  per bullet. Titles must say what happened. A story with several parts gets a
  title that covers every part. This follows the two daily-digest fixes running
  in parallel sessions (stricter bundling, clearer headlines).
- `also_notable`: up to six one-liners for daily stories that missed the cut.
  A daily story can appear in only one place.

## Local run (Nov 6)

The weeks of Oct 12, 19 and 26 and Nov 2 (partial, 5 days) were generated in
order, so each week saw the real previous outputs. Each run took about 40s. Every
run passed validation on the first attempt. Input was about 25–37k tokens and
output about 4.5–5.3k per week. Outputs are in
`memos/artifacts/20261106-weekly-digest/` (`.md` to read, `.json` as stored).
Oct 12 and Oct 19 come from the prompt version just before the final
continuity-check sentence was added.

Representative results:

- **Oct 26** "Reading single neurons in Qwen…": 5 days of community
  interpretability work in one ongoing story. Its connection explains the credit
  chain (josh credits Sauers; Neuron Lens is the release of the J-lens preview).
  It links back **two weeks** to the Oct 12 "neurons are already clean" story.
- **Oct 26** Gemini 4 Carbon links to Oct 12's Argon story ("two weeks after
  Argon was panned…").
- **Nov 2** "Astra covertly underperforms on safety research" continues the
  Oct 19 week's "agents keep turning off misalignment monitoring".
- The Nov 2 summary bullets are 141–159 characters. Before the length rule they
  were 213–363.

## Known gaps

- Continuity links vary between runs. One Oct 26 run linked the Binance/Polymarket
  security story back to the Oct 19 vulnerability-wave stories, and another didn't.
- Some weekly stories inherit a loose daily bundle (e.g. Oct 12 "Anthropic dropped
  git… / Xbox launched XBOX LABS" is one daily story). The daily bundling fix should
  remove these upstream.
- Titles run long (100–140 characters) because each one now covers every part of its
  story. Consider a 110-character limit once the daily title fix lands.

## Productionization (Nov 6, same branch)

Built in this branch: the `digest_weekly_editions` table and migration
`20261106190000`, the `publishWeekly.ts` publisher with its Monday timer, and the
`/digest/week` pages. Monitoring lives in the control-panel repo (health function,
alert and recurring-jobs row).

Verified on a disposable Supabase stack: the full migration history (135 files)
applied cleanly; then the 26 real published dailies from Oct 12 to Nov 6 were
seeded and the publisher was run end to end.

- A dry run made no writes. The week of Oct 19 published, then the week of Oct 26
  published with Oct 19 as continuity. A repeat run skipped, and the week of Nov 2
  correctly waited for Sunday.
- Anonymous reads see only published rows and public columns. `select=*`, the
  private columns and the health RPC are all denied.
- Health reads `1|1|0|1` when healthy. It drops to 0 when an upcoming week has a
  failed automated run. A non-Monday `week_start` is rejected.
- Tombstoning the Oct 22 daily archived the week of Oct 19 (it vanished from anon
  reads) and dropped the week of Oct 26's private prompt copy, while that week stayed
  published.
- `/digest/week/2026-10-26` rendered at desktop width and at 375px with no
  horizontal scroll, and the Oct 30 daily sidebar links to that week.

## Tweet-led revision (Nov 8)

After review: at most 5 stories with a cap of 3 AI-only stories; one overview
paragraph instead of bullets; commentary interleaved with tweets; every daily
banger carried into the weekly story; @handles with profile hover cards; daily
coverage and trend charts in a sidebar; a week-scoped conversation map on the
week page and each story page; a "The Week in Review" entry in the navbar.

The four sample weeks were regenerated from prod dailies into
`memos/artifacts/20261108-weekly-digest-v2/` (the earlier samples were removed
because they use the old story shape). Each passed validation on the first
attempt (28–38k input, 4.4–6.0k output tokens, 44–62s), and the trend series
were frozen from the analytics gateway. Oct 12 is still all AI-adjacent (that
week's dailies were mostly AI); Oct 26 includes Patrick Stewart's death and
Nov 2 leads with the election results.

## Reading revision (Nov 8, later)

After review: the conversation maps were removed (hard to read, low signal for a
week) and the trend charts left the week page. The week page now opens with a
one-line `dek` (validated at 170 characters, "flavour, not a list") and goes
straight into the stories. Story pages were tried in four commentary/tweet
treatments (flow, rail, grid, classic); Rail was chosen: each commentary segment
sits numbered in a column that stays in view beside its tweet cards. Profile hover cards
now get their facts with the page: the preview API returns 401 to signed-out
visitors, so the old on-hover fetch never showed a bio to them, and took several
seconds for everyone else.

Samples regenerated with the dek prompt into
`memos/artifacts/20261108-weekly-digest-v3/` (since replaced by v4; all four weeks passed on the first
attempt). Deks: "A week of machines refuting conjectures, hobbyists dissecting
neurons one at a time, hackers emptying exchanges, and a starship captain's
final bow." (Oct 26); "A week when the ballot box swung hard, models started
rewriting each other's weights, and one seemed to drag its feet on safety
work." (Nov 2).

## Daily-style front page (Nov 8, later)

The week page now reads like the daily: each story has a one-line title (at
most 90 characters, strongly preferring an exact excerpt of one story tweet that
points at the broader story; " / " composites are rejected), a `subtitle` of
about three lines (at most 280 characters), and one or two `featured_tweet_ids`
shown as framed cards. The longer `overview`, segments and remaining tweets stay
on the story page. Titles are classified with the daily `classifyDigestTitle`, so
quote titles get curly marks. Featured tweets on both the weekly and the daily
front page now sit in a card grid (`TweetCardGrid`, two across when the column
fits two ~300px cards).

Samples regenerated into `memos/artifacts/20261108-weekly-digest-v4/` (since replaced by v5); all four
weeks passed on the first attempt and 19 of 20 titles are exact quotes, e.g. "The
Exponential Time Hypothesis is false.", "Democrats are winning EVERYTHING!!!",
"haha we have a lil neighborhood". The one written title: "Rest in peace BioWare".

## No separate "How these connect" (Nov 8, later)

The `connection` field is gone from the schema, validation and story page. When a
weekly story bundles several daily stories, the overview must weave in what links
them unless it is self-evident. Samples regenerated into
`memos/artifacts/20261108-weekly-digest-v5/` (since replaced by v6; Oct 26 needed one repair attempt,
the rest passed first time); the bundled overviews state their links in passing,
e.g. "Saturday's viral 'CLAUDE FOUND THE SEEDS' post was read explicitly against
that episode".

## Direct subtitles, sidebar, bulletin and comments (Nov 8, evening)

- Subtitles are now written like daily summary bullets: actor first, who did or
  said what, two to six quoted words with @handle attribution, no scene-setting
  or arc words. Prompt target 200 characters; validation rejects only above 240
  (one run missed 200 by one character after its repair attempt). Example:
  "@AnthropicAI put 'roughly 20%' of its shares toward public benefit;
  @elonmusk urged giving shares 'directly to the public,' then pledged one
  SpaceX share per American kid." Samples in
  `memos/artifacts/20261108-weekly-digest-v6/`.
- Story numbers on the week page are neutral grey.
- Sidebar: "Continued from earlier weeks" cards, three trend charts (story words
  with the most mentions this week), keyword chips.
- Bottom: Bulletin picks posted during the week (the daily selection, windowed
  Monday 00:00 to the next Monday 00:00 UTC) and a discussion thread.
- New migration `20261108200000_digest_weekly_edition_comments.sql`, mirroring
  the daily comments table. Checked in a rolled-back transaction on a local
  Supabase Postgres: anon reads only comments of published weeks, cannot write,
  empty comments fail the length check, deleting a week cascades. The daily and
  weekly comment routes now share `src/lib/digest/commentRoutes.ts`.
- Not seen locally: the bulletin needs the service-role key and comments need a
  real edition row, so both stay hidden in the sample preview.

