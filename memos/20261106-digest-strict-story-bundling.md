# Daily Digest: strict story bundling

2026-11-06. Branch `claude/digest-strict-bundling`. Nothing applied to production.

## Problem

The nightly prompt said "group related bangers into three to five coherent
stories", and Opus read "related" as "same topic". The 2026-11-04 edition put
ICE's "If you vote illegally, we will find you", Nick Fuentes's "Get out and
vote Democrat today" and zagrebbi's "Don't vote" into one story. The only thing
they share is elections.

## Change

1. **Prompt v20 (new migration).** Adds a `STORY BUNDLING:` paragraph to the
   system prompt and one sentence to the user template. Bangers share a story
   only when they are about the same event, claim, thread, or direct exchange.
   A shared broad subject is never enough. A real but lateral link has to be
   spelled out in the subtitle or an In brief bullet. A weakly linked banger
   gets its own story or is left out. The migration copies the newest Opus 5.5
   version and inserts the new text at two anchors, so it stacks with the
   headline-density migration whichever one is applied first.
2. **Receiver check (deterministic).** A reply, quote, or thread row in a story
   that contains none of its parent bangers is now dropped, with an editorial
   warning. Across 40 past nightly runs (192 stories) this happened 4 times
   (10-06, 10-22, 10-23, 10-30). Each time, context had been borrowed from a
   banger outside the story. The check drops the row instead of rejecting the
   output, so it cannot fail a nightly run.

## Method

The frozen `model_request` of each `systemd:` run was read from production
(read-only): candidate snapshot, continuity context, and prompt v19. I rendered
it with the v20 text (byte-identical to what the migration produces, checked on
a disposable Postgres) and called the production `generateValidated` against
Opus 5.5 through OpenRouter. As a control, I re-ran 11-04 on v19 too, to
separate the prompt's effect from sampling noise.

## 2026-11-04 (the reported day)

| Published (v19) | v19 re-run (control) | v20 |
|---|---|---|
| Election results: Talarico (VoteHub, NBC, Timcast), Ossoff ×2, Andrews, TX Railroad Commission ×2, Van Swol, "I'm going to be sick" (10 bangers) | Same 9-banger election roundup | **Texas Senate projection:** VoteHub, NBC, Timcast. Subtitle says Pool "had previewed" the result |
| **ICE + Fuentes + "Don't vote"** | **ICE + Fuentes + "Don't vote"** again | **"Don't vote"** on its own, with trace/Roko/Sean Thomas replies. ICE and Fuentes dropped |
| tracewoodgrains "This is so bleak" | same | same |
| Altman "control of the future" | **Altman + Fable hand-written weights** lumped together | Altman alone |
| Fable hand-written weights | (French blood bank cyber attack) | Fable alone |

The control reproduces the loose bundle, so the change comes from the prompt.

## Spot checks: coherent stories kept, loose additions removed

- **11-02.** Haley Stevens endorses Rogers: v19 had 5 bangers, v20 has 4 (all
  about the endorsement; the Zohreen El-Sayed data take was dropped). The
  Suleyman, mossing, and "unusually honest person" stories each lost
  topic-only bangers (a consciousness joke, a repligate reply, two
  meditation-path posts).
- **11-03.** Weight-space programming (Takehi + Krentsel's reproduction): kept
  intact. visakanv's parenting post no longer carries the MDD-PGT
  genetic-prediction launch. The Traldi LSAT/fiancé claim no longer carries an
  unrelated Stevens statement; v19's subtitle only said they "ran alongside".
  The freed slot went to a location-leak-from-audio story.
- **11-05.** Astra covert underperformance (Williams thread + scaling01):
  kept, with a repligate side reply dropped. The floor-fetish joke pair: kept,
  and the subtitle states the link (near-identical line ten seconds apart,
  then a mock theft feud). The Vance "reason we lost" story dropped two generic
  election-reaction bangers; one of them (Jean Lannes) became its own story.
  The "AI pause / regulation / Musk data centers in space" bundle, which only
  shared a topic, was dropped.

## Trade-offs

- v20 is stricter about election-night results. On 11-04 it kept only the Texas
  Senate race and dropped the Georgia and South Carolina calls, which a reader
  might count as one event. If the editor wants multi-race roundups, the rule
  could name "one election night's results" as a single event.
- Stories got smaller: 28 bangers placed in v20 versus 49 in v19 across the
  four days. That is the intended direction, but it gives fewer
  cross-references per story.
- One of the five runs (11-02) needed the existing repair retry for a bullet
  over 220 characters. That is an existing limit and not related to this
  change.
- The receiver cannot check whether two bangers are semantically linked. That
  part is enforced only by the prompt.

## Not done

- The migration is not applied to production, nothing was published, and
  nothing was deployed.
- Migration order with `claude/digest-headline-density`: see the PR.
