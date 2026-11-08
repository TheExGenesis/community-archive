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
  - Titles: exact quote for single-element stories. For multi-element stories,
    one headline (under ~100 characters) as close to the posts' own words as
    possible, optionally quoting two to six telling words inline; it must say
    who did or said what. Iterations with the user (2026-11-07/08): stitched
    ` / ` quotes read as fragments; pure paraphrased headlines lost the posts'
    language; inline quotes in a sentence was the keeper. "Two to six words"
    was needed because the model otherwise quoted whole sentences (140+ chars).
- Receiver (`classifyDigestTitle` in `src/lib/digest/generation.ts`): new
  `titleKind` = `quote` | `composed` | `voice`. Composed titles (no longer
  requested, still recognised) are stored as `“A” / “B”`; `titleIsQuote` is true only for `quote`, so existing renderers
  (web, email, metadata) need no change.
- Warnings: paraphrase warning only for one-banger stories; a quoted span
  (inline or ` / ` part) that is not an exact excerpt is flagged; an `Also:` bullet is flagged. (I tried a
  comma-count "crammed bullet" warning; it fired on good bullets with
  appositives, so it was dropped.)

## Before / after (same frozen runs, same model, new prompt only)

Regenerated locally with `scripts/regenerate-digest-run.ts` from the frozen
`digest_runs.model_request` (candidate snapshot + continuity context). Story
grouping varies between runs, so rows pair stories by their lead banger.

### 2026-10-31

Summary before:
1. Claude Code's hidden rule against recreating existing games sparked outrage, alongside plan renames and an unverified leak claim.
2. a9lim and treetown released Neuron Lens, a database reading every neuron and attention head in Qwen 3 8B and Gemma 4 12B.
3. Also: Pope Leo versus janus on AI control, Kulveit's microdosing essay, and doubted biocompute and Subvocal launches.

Summary after:
1. Claude Code quietly gained a rule against recreating existing games, and Anthropic renamed its Max plans and lifted Ultra's 5-hour limit.
2. a9lim and treetown released Neuron Lens, a database that explains what most neurons do in two open AI models.
3. Pope Leo said machines are tools, not persons, and janus argued that stopping AI models from talking in neuralese is authoritarian.

| Before | After |
|---|---|
| ANTHROPIC IS CRACKING DOWN ON VIDEO GAME REWRITES | Claude Code gets a rule against “a recreation of a specific existing game” as Anthropic renames Max plans |
| Machines are tools, not persons. (Pope + janus) | Pope Leo says “Machines are tools, not persons” while janus calls neuralese limits authoritarian |
| neuron lens: a database of every single neuron… | *(same quote)* |
| My go-to conceptual metaphor … is microdosing | *(same quote)* |
| biocompute is real, commercial and this is just the beginning | *(story not picked in this run; an earlier run gave: Alex Ksendzovsky says “biocompute is real, commercial” as Subvocal raises $1.3M for silent-speech glasses)* |

### 2026-10-30

Summary before:
1. Sam Altman called local inference a terrible use of scarce DRAM, and replies defended ownership and a right to compute.
2. A reported $5.6B Binance hack, a Polymarket breach, and Epoch's GLM 5.3 Firefox exploits deepened the AI-security dread.
3. Also: one-neuron owls and persona solving, Patrick Stewart's death at 86, and a fight over rationalist event LLC paperwork.

Summary after:
1. Sam Altman called local AI inference a waste of scarce memory chips, and critics answered that owning your own compute means freedom.
2. Watcher.Guru reported a $5.6 billion Binance hack as Polymarket halted trading and Epoch showed an open model can cheaply hack Firefox.
3. Researchers showed one trained neuron can turn Qwen into an owl, while fans mourned Patrick Stewart, who died at 86.

| Before | After |
|---|---|
| sam: local inference is a terrible allocation of scarce resources | Sam Altman calls local inference “a terrible allocation of scarce resources” and touts “self-replicating data centers” |
| Binance hacked with over $5.6 billion stolen | Watcher.Guru reports “over $5.6 billion stolen” from Binance as Polymarket halts trading and GLM 5.3 exploits Firefox |
| You can turn Qwen3-8B into an owl by training only one random neuron! | Researchers make an owl from “only one random neuron,” link “neural twins,” and release OpenTTD-Bench |
| Patrick Stewart has sadly passed away at the age of 86. | *(same quote)* |
| the rats need to Update All The Way on AI | mimi says “the rats need to Update All The Way on AI” as others say rationalists “defect literally every time” |

## Observations

- Bullets now read cold; none uses `Also:`. As requested, fewer stories are
  named (biocompute/Subvocal and microdosing drop out of the 10-31 summary).
- Multi-element stories now get one sentence in the posts' words with short
  inline quotes; single-element stories keep their quote. Titles land around
  95–118 characters, slightly over the 110 target in a few cases (non-fatal
  warning).
- Some bullets now run a little over 140 characters (non-fatal warning).
- Story selection varies run to run (biocompute/Subvocal was dropped in the
  final 10-31 run; OpenTTD-Bench joined the owl story on 10-30). Grouping
  belongs to the bundling change (PR #1209).
- The first draft runs needed the existing repair retry for an In-brief bullet
  over 220 characters; the final runs passed on the first attempt.

Raw outputs: session scratchpad (`v6-2026-10-30.json`, `v6-2026-10-31.json`),
not committed.
