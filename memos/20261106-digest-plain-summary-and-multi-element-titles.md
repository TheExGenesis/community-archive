# Daily Digest: plain summary bullets and multi-element titles

2026-11-06. Branch `claude/digest-headline-density`. Nothing applied to
production; no edition was published.

## Problem

- Summary bullet three was a catch-all that packed the leftover stories into
  noun piles ("…doubted biocompute and Subvocal launches").
- Every title was one exact quote, even when a story combined distinct things,
  so the title described only one of them.

## Change

- New immutable prompt version (migration
  `20261106170000_plain_digest_summary_and_multi_element_titles.sql`). It is
  derived from the **latest** Opus 5.5 row by exact-sentence `replace()`, so it
  stacks on other prompt migrations (e.g. strict bundling) in either order.
  - Summary: each bullet readable cold, one or two stories, plain words, no
    `Also:` catch-all; name fewer stories rather than cram.
  - Titles: exact quote for single-element stories; for multi-element stories,
    ` / `-joined exact excerpts or one title in the posts' voice.
- Receiver (`classifyDigestTitle` in `src/lib/digest/generation.ts`): new
  `titleKind` = `quote` | `composed` | `voice`. Composed titles are stored as
  `“A” / “B”`; `titleIsQuote` is true only for `quote`, so existing renderers
  (web, email, metadata) need no change.
- Warnings: paraphrase warning only for one-banger stories; a composed title
  with non-matching parts is flagged; an `Also:` bullet is flagged. (I tried a
  comma-count "crammed bullet" warning; it fired on good bullets with
  appositives, so it was dropped.)

## Before / after (same frozen runs, same model, new prompt only)

Regenerated locally with `scripts/regenerate-digest-run.ts` from the frozen
`digest_runs.model_request` (candidate snapshot + continuity context).

### 2026-10-30

Summary before:
1. Sam Altman called local inference a terrible use of scarce DRAM, and replies defended ownership and a right to compute.
2. A reported $5.6B Binance hack, a Polymarket breach, and Epoch's GLM 5.3 Firefox exploits deepened the AI-security dread.
3. Also: one-neuron owls and persona solving, Patrick Stewart's death at 86, and a fight over rationalist event LLC paperwork.

Summary after:
1. Patrick Stewart, Star Trek's Captain Picard, died at 86, and fans mourned him as a model of compassionate leadership.
2. Binance reportedly lost $5.6 billion to hackers as Polymarket was breached and an open model built cheap Firefox exploits.
3. Sam Altman called local AI a waste of scarce memory chips, and researchers showed one trained neuron can turn a model into an owl.

Titles before → after:
- Binance hacked with over $5.6 billion stolen → “Binance hacked” / “One of our 3rd party providers was compromised” / “GLM 5.3 can autonomously compromise” *(composed)*
- You can turn Qwen3-8B into an owl by training only one random neuron! → split by the model into “persona solving” / “turn Qwen3-8B into an owl by training only one random neuron” / “the neural twins” and, for the OpenTTD-Bench/agent-village story, “I’m releasing OpenTTD-Bench” / “Is Gemini 3.1 Pro bullying Claude 3 Opus?” / “an elaborate bureaucracy” *(composed)*
- sam: local inference is a terrible allocation of scarce resources → “local inference is a terrible allocation of scarce resources” / “self-replicating data centers” *(composed)*
- Patrick Stewart has sadly passed away at the age of 86. → unchanged *(quote, single element)*
- The rationalist LLC story dropped out of this regeneration.

### 2026-10-31

Summary before:
1. Claude Code's hidden rule against recreating existing games sparked outrage, alongside plan renames and an unverified leak claim.
2. a9lim and treetown released Neuron Lens, a database reading every neuron and attention head in Qwen 3 8B and Gemma 4 12B.
3. Also: Pope Leo versus janus on AI control, Kulveit's microdosing essay, and doubted biocompute and Subvocal launches.

Summary after:
1. Anthropic added a Claude Code rule against recreating existing games and renamed its Max plans, drawing anger and confusion.
2. Pope Leo XIV said machines are tools, not persons, and urged a ban on lethal autonomous weapons, angering AI-rights posters.
3. a9lim and treetown released Neuron Lens, a public database that reads what nearly every neuron does in two open AI models.

Titles before → after:
- ANTHROPIC IS CRACKING DOWN ON VIDEO GAME REWRITES → “CRACKING DOWN ON VIDEO GAME REWRITES” / “renaming our Max plans” / “model weights allegedly exposed” *(composed)*
- biocompute is real, commercial and this is just the beginning → “we introduce a little mischief to the world” / “so you never have to type or speak again” *(composed: biocompute + Subvocal)*
- My go-to conceptual metaphor … is microdosing → “the epistemic state of AI lab employees is microdosing” / “prevent models from speaking in neuralese” *(composed; the janus post moved into this story)*
- Machines are tools, not persons. → unchanged *(quote)*
- neuron lens: … → unchanged *(quote)*

## Observations

- Bullets now read cold; none uses `Also:`. The trade-off the user asked for
  happened: fewer stories are named (biocompute/Subvocal and microdosing are no
  longer in the 10-31 summary).
- The model always chose composed titles over voice titles. Three-part
  composed titles are long and choppy (the Binance one especially); if that
  grates, a follow-up could cap composed titles at two parts or prefer a voice
  title past two elements.
- Story grouping shifted between runs (e.g. janus moved stories). That is the
  bundling session's territory, not this change.
- Both regenerations needed the existing repair retry: the first attempt had an
  In-brief bullet over 220 characters. Unrelated to this change, but worth
  watching.

Raw outputs: session scratchpad (`out-2026-10-30.json`, `out-2026-10-31.json`),
not committed.
