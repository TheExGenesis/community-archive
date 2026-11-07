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
    one short, plain headline (about twelve words) in the posts' voice that
    makes sense on its own. A first draft also allowed ` / `-joined quotes;
    the model always picked those and they read as stitched fragments, so the
    user asked for headlines that make sense instead (2026-11-07).
- Receiver (`classifyDigestTitle` in `src/lib/digest/generation.ts`): new
  `titleKind` = `quote` | `composed` | `voice`. Composed titles (no longer
  requested, still recognised) are stored as `“A” / “B”`; `titleIsQuote` is true only for `quote`, so existing renderers
  (web, email, metadata) need no change.
- Warnings: paraphrase warning only for one-banger stories; a composed title
  with non-matching parts is flagged; an `Also:` bullet is flagged. (I tried a
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
1. Anthropic told Claude Code to refuse remakes of existing games and renamed its Max subscription plans to Max and Ultra.
2. Pope Leo XIV said AI systems are tools, not persons, while janus defended letting AI models talk to each other in their own code.
3. a9lim and treetown released Neuron Lens, a database that reads what nearly every neuron in two open AI models does.

| Before | After |
|---|---|
| ANTHROPIC IS CRACKING DOWN ON VIDEO GAME REWRITES | Anthropic blocks game recreations in Claude Code and renames Max plans |
| biocompute is real, commercial and this is just the beginning | A brain-cell-inspired video model and silent-speech glasses both launch |
| Machines are tools, not persons. (Pope + janus) | The pope says machines are tools, not persons, while janus defends neuralese |
| neuron lens: a database of every single neuron… | a database of every single neuron and attention head in qwen 3 8b and gemma 4 12b *(quote)* |
| My go-to conceptual metaphor … is microdosing | *(same quote)* |

### 2026-10-30

Summary before:
1. Sam Altman called local inference a terrible use of scarce DRAM, and replies defended ownership and a right to compute.
2. A reported $5.6B Binance hack, a Polymarket breach, and Epoch's GLM 5.3 Firefox exploits deepened the AI-security dread.
3. Also: one-neuron owls and persona solving, Patrick Stewart's death at 86, and a fight over rationalist event LLC paperwork.

Summary after:
1. Sam Altman called running AI on personal computers a waste of scarce memory chips, and critics said owning compute means freedom.
2. Hackers reportedly stole $5.6 billion from Binance, while Epoch showed an open AI model can cheaply build Firefox exploits.
3. Patrick Stewart died at 86, and a researcher showed a model can become an owl by training just one neuron.

| Before | After |
|---|---|
| sam: local inference is a terrible allocation of scarce resources | Sam Altman says local inference is wasteful and self-replicating data centers are within grasp |
| Binance hacked with over $5.6 billion stolen | A record Binance hack, a Polymarket breach and cheap Firefox exploits stoke AI-attack fears |
| You can turn Qwen3-8B into an owl by training only one random neuron! | Researchers turn a model into an owl with one neuron and link neural twins |
| Patrick Stewart has sadly passed away at the age of 86. | *(same quote)* |
| the rats need to Update All The Way on AI | the rats need to Update All The Way on AI and notice that blatant lying is easier to fact check these days. *(quote, over the length target)* |

## Observations

- Bullets now read cold; none uses `Also:`. As requested, fewer stories are
  named (biocompute/Subvocal and microdosing drop out of the 10-31 summary).
- Multi-element stories now get real headlines; single-element stories keep
  their quote. The first headline-only draft still produced a noun pile
  ("Brain-cell-inspired video model mischief 1 and silent-speech Subvocal
  glasses launch…") and a three-item list, which the ~12-word / plain-words
  rule fixed.
- In this run OpenTTD-Bench (Sofia) fell out of the 10-30 edition rather than
  being bundled with the owl story. Grouping belongs to the bundling change
  (PR #1209).
- The first draft runs needed the existing repair retry for an In-brief bullet
  over 220 characters; the final runs passed on the first attempt.

Raw outputs: session scratchpad (`v3-2026-10-30.json`, `v3-2026-10-31.json`),
not committed.
