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

## Next steps (need approval: schema + production)

1. A `digest_weekly_editions` table (week_start, version, status, content, source
   daily edition IDs, model trace) with the same public RLS as daily editions.
   Stored prior weekly editions replace reading prior weeks from local files.
2. `/digest/week/YYYY-MM-DD` page that reuses the editorial `TweetCard` and links
   back to the daily stories.
3. A Monday timer on the nightly-digest host, after Sunday's daily publishes
   (plus monitoring per the service-catalog rule), and optionally a weekly email.
