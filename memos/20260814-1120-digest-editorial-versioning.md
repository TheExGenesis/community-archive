# Daily Digest editorial versioning

Date: 2026-08-14 11:20 PDT

## Outcome

The Digest lab now treats generation, AI revisions, manual edits, and
publication as separate explicit steps. Completed model runs are immutable;
candidate changes and free-text revision requests create new addressable runs.
Staging creates a private draft, every inline edit creates another draft
version, and a prominent publish action is the only path to the public page.

## Generation contract

The active prompt uses `deepseek/deepseek-v4-flash-0731` through OpenRouter with
high reasoning and a 6,000-token output ceiling. Structured output requires:

- exactly three one-sentence summary bullets;
- three to five grounded stories;
- a representative corpus index;
- loose story types, explanatory subtitles, In brief bullets, editor notes,
  indexed tweets, and exact corpus keywords.

The first two summary bullets cover the dominant stories. If the edition does
not reduce to three clean bullets, the third is a compact catch-all for the
remaining stories. The prompt explicitly asks the model to inspect absurdity,
tone, sarcasm, source credibility, replies, and quote-post context before
treating a literal-sounding claim as news. Jokes, satire, and shitposts must be
labeled and explained as such; genuine ambiguity belongs in the editor note.
The schema leaves 200 characters of safety headroom around the 140-character
editorial target so a provider cannot meet a hard limit by clipping the final
catch-all sentence mid-word.

## Version boundaries

- A candidate selection changed after completion forks a new editable run.
- A free-text revision creates a new run linked by `parent_run_id` and retains
  the editor's instruction in `revision_instruction`.
- The revision call receives the current validated edition plus the same
  indexed corpus and is told to preserve fields the editor did not ask to
  change.
- Staging and inline saves append `digest_editions` draft versions; neither
  overwrites an earlier artifact.
- Publishing remains a service-role RPC and is never invoked automatically.

## Staging failure diagnosis

The earlier **Stage as new draft version** attempt never reached the server and
left no row in the edition ledger. The shared button synchronously disabled
itself during its click event, which could cancel the browser's form submission
while leaving the local “Staging edition…” label visible. Loading state is now
deferred until after native form submission begins, and staging/publishing add
structured start, completion, and failure log entries keyed by run or edition
ID.

## Staging verification

Migrations `20260814180703` and `20260814182657` are applied and recorded on
the Community Archive staging project. The second migration covers the
edition-to-run foreign key identified by the performance advisor. The remaining
Digest advisor notices are expected: prompt/run tables are service-role-only
with RLS and no public policies, published editions are intentionally visible
through their status-gated RLS policy, and new indexes have not yet accumulated
usage. Anonymous and authenticated roles cannot select runs, and anonymous
users cannot execute the publication RPC.

## Live editorial smoke test

The deployed preview staged August 12 as private draft v1, saved a manual
inline correction as private draft v2, and retained both ledger entries. The
public August 12 route remained unpublished. A linked AI revision continued
after navigating away and completed in 56.9 seconds with exactly three summary
bullets and five stories; it correctly reclassified the P-vs.-NP post as a
`Viral joke`. That smoke exposed a provider behavior where the 140-character
JSON Schema ceiling clipped the catch-all bullet mid-word, leading to the
schema-headroom change above.
