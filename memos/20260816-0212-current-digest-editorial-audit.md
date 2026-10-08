# Current Digest Editorial Audit

**Date:** 2026-08-16 02:12 PDT  
**Scope:** Published Community Archive Digest editions for August 13–15, 2026; the live Digest Lab; and the generation, validation, and rendering paths on `origin/main`.

## Executive summary

The Digest already has the shell of a strong product: it is visually confident, exposes its sources, preserves frozen editions, and gives an editor a review step. The main weakness is upstream of prose. The system asks a model to convert a small, uneven set of posts into three to five polished stories, while supplying incomplete context for replies, links, and media. The model responds by smoothing over those gaps: it joins unrelated leftovers, upgrades secondhand claims into news, and fills mandatory editorial fields with generic disclaimers.

The result is closer to a polished **daily sampler of Community Archive bangers** than a reliable account of “What Happened Yesterday.” That can become a good product, but the selection, context hydration, output schema, and review checks need to match that editorial promise.

The highest-leverage change is not a more eloquent prompt. It is a new sequence:

> discover candidates → reject or flag incomplete sources → hydrate thread/link/media context → plan coherent stories and briefs → validate the plan → write → editorial review

A prompt-only v11 can improve the next run immediately, but it will remain constrained by the current requirement to produce at least three stories and a mandatory editor’s note for every story.

## What I reviewed

- [August 13 edition](https://www.community-archive.org/digest/2026-08-13)
- [August 14 edition](https://www.community-archive.org/digest/2026-08-14)
- [August 15 edition](https://www.community-archive.org/digest/2026-08-15)
- Story pages, including [“US tells countries to pick a side in AI”](https://www.community-archive.org/digest/2026-08-14/us-tells-countries-to-pick-a-side-in-ai)
- The live Digest Lab, including candidate selection, the active v10 prompt, run traces, continuity input, and edit/publish controls
- The current generation, validation, context-fetching, and rendering code on `origin/main`
- The earlier comparison with Zvi’s newsletter method in [Zvi Twitter Newsletter Patterns](./20260815-1251-zvi-twitter-newsletter-patterns.md)

Across the three published editions, the system selected 26 candidates and used 17 of them in 12 stories. Nine of the 12 stories are based on a single selected banger. The few multi-banger stories are where most of the coherence problems appear.

## What already works

### 1. The visual and product structure is unusually strong for an early editorial system

The edition page has a recognizable hierarchy, typography, clear dates, story cards, and links into detailed source pages. It looks like a publication rather than a debug view. That matters: the product has enough authority that readers are likely to take its editorial claims seriously.

### 2. Provenance is visible

Readers can inspect the original selected posts, archived quote posts, and replies. The admin view also preserves the date window, prompt version, model, token count, run status, and frozen corpus. These are excellent foundations for accountable editing.

### 3. There is a real human review boundary

Generation does not automatically publish. The editor can modify fields, compare versions, and publish a frozen edition. The missing piece is a stronger review surface: today it is easier to correct prose than to see that a story should not exist as a cluster.

### 4. The system is trying to do editorial work, not merely sort by likes

It distinguishes categories, creates summaries, brings in community response, and loads recent issues for continuity. The ambition is correct. The current evidence and schema do not yet support that ambition consistently.

## Main editorial problems

### 1. The model is forced to manufacture coherence

The clearest example is the August 15 story titled around the “As a woman…” quest joke. It contains four unrelated posts:

- a joke about preventing war through a quest;
- a Fort Greene meditation invitation;
- a fridge-magnet poetry game;
- praise for Zürich accompanied by media.

The subtitle admits that these are merely “other lighter community posts.” That is not a story; it is a leftover bucket disguised as one. August 14 repeats the pattern by pairing a critique of therapy culture with the unrelated war-prevention joke.

The active prompt directly causes this. It requires exactly three summary bullets and tells bullet three to catch all remaining stories. The output schema requires three to five stories. On a sparse or incoherent day, the model has no honest “two stories and four briefs” option.

**Editorial rule:** a story cluster should exist only when all included sources concern the same event, claim, product, conversation, or directly connected meme. Topical adjacency such as “AI,” “culture,” or “lighter posts” is not enough.

### 2. The summary and the published stories can disagree

On August 15, the third summary bullet mentions AI-coding burnout and Vim alongside the lighter items, but those candidates do not appear in a published story. The generation validator checks that there are three nonempty summary strings; it does not require a summary claim to point to a returned story.

This breaks the summary’s most important promise: that it is a compressed map of the issue. Summary items should reference story or brief IDs, and the renderer should derive the visible bullets from those references.

### 3. Incomplete sources are treated as complete evidence

The generation prompt receives the post text, author, timestamp, likes, reposts, and a `has_media` boolean. It does not receive enough information to understand several common source types:

- A reply such as Dario Amodei’s “2/2” arrives without the head of the thread.
- Yudkowsky’s “Uh, no…” arrives without the parent it contradicts.
- Link-only or link-led posts arrive without the expanded URL, page title, publisher, description, or a verified excerpt.
- Media-led posts arrive with `has_media: true`, not the image, alt text, OCR, or a caption.

No prompt can reliably summarize content it has not been shown. These candidates should either be hydrated before generation or marked ineligible for factual summary.

### 4. Attribution gets flattened

The August 14 Anthropic story presents “Dario’s private-company vision” even though the source is a post relaying another person’s account of what trusted sources reportedly said. The US/AI story says Reuters reports the policy, but the supplied banger is a secondary post citing Reuters.

The distinction matters. The digest should preserve the chain:

- direct source: “Reuters reported…” when the Reuters page or verified metadata is in the corpus;
- secondary source: “MTS, citing Reuters, said…”;
- secondhand claim: “A post relaying Gavin Baker’s account says…”;
- editorial inference: explicitly labeled as the Digest’s read.

The current `editorial_note` does not repair this. It often becomes a generic disclaimer after the headline and subtitle have already overstated the evidence.

### 5. Community response is collected, but not edited

Story pages can contain many quote posts and replies, including bare links, “what the heck,” insults, and near-duplicates. The “In brief” section on the US/AI story says responses split between “exactly the wrong direction” and “china correct,” even though both are criticisms of the US position. That is not a meaningful split.

Community commentary should be selected by role, not by availability:

- explanation or missing context;
- evidence or concrete example;
- counterargument;
- correction;
- consequence;
- genuinely additive punchline.

Most stories need one to four nonredundant reactions. The raw archive can remain available below or behind an expansion control.

### 6. The page repeats source material instead of leading with editorial value

The representative tweet is rendered in full near the top, then commonly rendered again inside its story. On August 15, this duplicates a very long Dario post before the reader reaches much synthesis. Quote cards can also repeat the lead tweet inside each quote.

The lead should be a short editorial lede or compact source excerpt. A source should appear in full once. Detailed raw conversation belongs after the synthesis, not ahead of it.

### 7. Several details weaken reader trust

- Published quoted titles can display nested straight and curly quotation marks. The editor updates the title text but preserves the model’s old `titleIsQuote` flag, so manual edits can produce doubled punctuation.
- Story pages say “1 bangers.”
- The 06:00–05:59 UTC editorial day is defensible, but a post visibly dated August 15 can appear in the August 14 issue. The cutoff needs to be explained near the date or displayed in the reader’s timezone.
- “What Happened Yesterday” implies general news coverage. The actual source is a narrow, community-weighted banger set. “What the Community Archive was talking about” is closer to the present product unless broader source coverage is added.
- “Viral,” “resonated widely,” and “sparked debate” are used more confidently than a handful of archived quote posts warrants.

## Root causes in the current setup

| Setup choice | What it produces | Better contract |
|---|---|---|
| Candidate eligibility is mainly `quoteCount >= 2`, up to 50 | Bare links, reply fragments, media-only posts, and thin jokes enter on equal footing with complete sources | Use quote count for discovery; require context completeness and editorial value for publication |
| All candidates default selected | The model must decide both what matters and how to package it inside one prose call | Triage before writing; show default exclusions and warnings to the editor |
| Three to five stories required | Sparse days generate fake clusters | Allow one to five stories plus zero to eight briefs |
| Exactly three bullets, with bullet three as catch-all | A ranked summary becomes an exhaustive leftovers sentence | Let all three bullets be ranked; allow the third to be omitted or point to a brief rail |
| Mandatory editor’s note, minimum length | Generic caveats and restatement | Make it optional and render it only when it adds a crux, uncertainty, or judgment |
| Thread, link, and media context missing | Confident summaries of unseen material | Hydrate before planning; block incomplete candidates from factual claims |
| One generation call plans and writes | Bad grouping becomes polished prose before an editor sees it | Plan first, validate, then write |
| Structural validation only | Valid JSON is mistaken for editorial validity | Add coherence, attribution, coverage, and source-completeness checks |
| Full representative tweet plus full story tweets | Repetition and excessive scroll | Use a compact lead; render each full source once |

## Recommended target workflow

### Stage 1: Discover

Keep the Community Archive banger signal, but treat it as candidate discovery rather than publication eligibility. Score or expose:

- number of distinct Community Archive quoters;
- relevance to the community;
- novelty versus the previous seven issues;
- self-containedness;
- source richness;
- whether the item is a reply, link-led, or media-led;
- engagement only as a secondary signal.

### Stage 2: Hydrate and gate

Before generation:

- recover the original post and thread head for partial threads and replies;
- expand links and capture the canonical URL, publisher, page title, description, and a small verified excerpt when permitted;
- load quoted-post data;
- load media, alt text, OCR, or an editor-provided caption;
- label the source as direct, secondary, secondhand, opinion, satire, or promotional;
- mark unresolved items `context_incomplete` and prevent the model from inferring their unseen content.

### Stage 3: Plan

Have the model produce an editorial plan, not prose:

```text
candidate → story | brief | omit
story → shared topic key + why these sources belong together
source → anchor | evidence | counter | correction | continuation | punchline
claim → supporting source IDs + direct/secondary/inference status
omit → short reason for the editor
```

The editor should be able to move candidates between those bins before writing. This is the highest-value human review moment.

### Stage 4: Validate the plan

Reject or warn on:

- a multi-source story without one specific shared subject;
- a summary topic with no story or brief ID;
- a source used in more than one story;
- a representative source outside the primary story;
- factual treatment of a context-incomplete source;
- “viral,” “widely,” or “debate” without a defined evidence threshold;
- a secondhand claim written as direct reporting;
- unused selected candidates that are not explicitly marked omitted;
- title punctuation that will be doubled by the renderer.

### Stage 5: Write

Write only from the approved plan. The model may compress aggressively, but it may not change grouping, add sources, or promote a brief into a story.

### Stage 6: Review and publish

Put a short checklist beside the publish button:

1. Every cluster is genuinely coherent.
2. Every factual claim has complete source context and precise attribution.
3. Every summary item maps to visible content.
4. No omitted candidate appears in the summary or keywords.
5. Commentary adds a distinct role rather than repetition.
6. The lead source is not rendered twice.
7. Final title punctuation and singular/plural labels render correctly.

Rename the current “validated” state to “structurally validated” until these editorial checks exist.

## Prompt-only v11 for the current schema

This version is designed to reduce the worst failure modes without first changing code. It cannot solve missing context or the forced minimum of three stories.

### Proposed system prompt

```text
You are the editor of the Community Archive Daily Digest.

Your job is to produce a ranked editorial read of the supplied corpus, not an
exhaustive recap and not a list of popular posts. Use only facts present in the
corpus. Never fill gaps from general knowledge.

STORY COHERENCE
- A story may combine bangers only when every included banger concerns the same
  specific event, claim, product, conversation, or directly connected meme.
- Broad adjacency such as “AI,” “culture,” “funny,” or “lighter posts” is not a
  sufficient reason to group items.
- A single-banger story is better than an incoherent multi-banger story.
- You may omit weak or unrelated candidates. Never mention an omitted candidate
  in the summary, subtitle, bullets, editorial note, or keywords.

SOURCE DISCIPLINE
- Treat a reply fragment, partial thread, bare link, or media-led post as
  context-incomplete unless its missing context is explicitly included.
- Do not infer the contents of an unseen link or image.
- Preserve attribution chains. Distinguish direct reporting, a source citing a
  report, a secondhand claim, opinion, satire, and your editorial inference.
- Place uncertainty next to the claim it qualifies.
- Do not say an item was viral, widely shared, resonant, or sparked debate unless
  the corpus contains clear, independent evidence for that exact claim.

EDITORIAL SHAPE
- Build 3–5 stories from the strongest coherent material. Choose importance and
  community relevance over completeness.
- Exactly three summary bullets are required by the current format. They are a
  ranked read: the first two cover the dominant stories; the third may cover
  another returned story or tightly related returned stories. It must not be a
  catch-all for unrelated candidates.
- Every topic in a summary bullet must appear in a returned story.
- Choose one representative banger from the primary story, never from replies or
  quote-post commentary.
- For each story, silently assign each context item one role: anchor, evidence,
  counterargument, correction, continuation, consequence, or punchline. Use the
  smallest nonredundant set that explains the story.

WRITING
- Write a title that names the actual development or crux. Do not include outer
  quotation marks; the interface adds them when needed.
- The subtitle should state what happened and why it matters, while preserving
  source status and uncertainty.
- Use one to three bullets. Each bullet must add a distinct fact, mechanism,
  consequence, counterpoint, or uncertainty.
- The current schema requires an editor’s note. Make it one short, specific
  sentence identifying the crux, open question, or editorial net assessment.
  Never use it as a generic “claims may be unverified” disclaimer.
- Classify satire as Viral joke. Do not present the literal premise as news.
- Keywords must occur verbatim in the supplied corpus.

FINAL CHECK
Before returning JSON, verify that every multi-banger story has one precise
shared subject, every summary topic maps to a returned story, every factual
claim is supported by visible context, and the representative is a banger in
the primary story.
```

### Proposed user prompt template

```text
Build today’s Digest from the supplied frozen corpus.

1. First decide which candidates are coherent stories, which should stand alone,
   and which should be omitted. Do this silently.
2. Prefer fewer, stronger sources inside each story. Do not use commentary merely
   because it is available.
3. If a candidate is a partial thread, reply fragment, bare link, or media-led post
   without its missing context, describe only what is visible or omit it.
4. Return exactly the JSON required by the schema and no prose outside it.

EDITORIAL WINDOW:
{{window}}

RECENT EDITIONS FOR NOVELTY ONLY:
{{continuity}}

FROZEN CORPUS:
{{corpus}}
```

## Schema v12: the more important follow-up

The next schema should make honest output easy:

```text
edition
  lede: 1–2 sentences
  summary: 1–3 references to story_id or brief_id
  stories: 1–5
    id
    title
    subtitle
    banger_indices
    context_indices with roles
    claim_sources
    editorial_note?       # optional
    continues_story_id?   # explicit continuity
  briefs: 0–8
    id
    one-line text
    source_index
  omitted: admin-only list with reason
  quality_checks: admin-only booleans/warnings
```

This removes the incentive to create a fake third story and gives good standalone posts an honest home. Recent-edition continuity should use stable topic/source IDs and explicit `continues_story_id`, not just prior prose and keywords.

## Product and rendering changes

1. Replace the full “representative tweet” at the top with a two-sentence lede or a compact source card. Never render the same full tweet twice.
2. Put editorial synthesis before the raw archive on story pages. Collapse the remaining thread/quote material under “Explore the conversation.”
3. Label context by role: “Why it matters,” “Counterpoint,” “Correction,” or “Community reaction,” rather than presenting one undifferentiated list.
4. Recompute `titleIsQuote` after inline edits or normalize outer quote marks at save/render time.
5. Fix singular/plural labels and preview the final public rendering inside the editor.
6. Explain the editorial cutoff beside the issue date, or display source dates in the same editorial timezone.
7. Consider renaming the promise to “What the Community Archive was talking about” unless the source universe becomes broad enough to justify “What Happened Yesterday.”

## Evaluation plan

Freeze six to ten historical corpora, including deliberately difficult days:

- fewer than three coherent topics;
- unrelated high-scoring jokes;
- a `2/2` reply without a parent;
- a bare-link candidate;
- an image-led candidate;
- a secondhand claim;
- multiple near-duplicate reactions;
- a real correction or counterargument.

Compare v10, prompt-only v11, and the plan/write design. Have an editor score each issue from 0–2 on:

1. prioritization;
2. cluster coherence;
3. context completeness;
4. attribution accuracy;
5. editorial gain over reading the tweets directly;
6. compression and nonrepetition;
7. distinct Community Archive perspective.

Automatic tests should cover summary-to-story referential integrity, source reuse, representative membership, incomplete-context restrictions, title quote normalization, and the ability to publish fewer than three stories without fabrication.

## Priority order

### P0 — before treating the Digest as reliable editorial output

1. Hydrate or block reply fragments, links, and media-led candidates.
2. Allow briefs and fewer than three stories; remove the forced catch-all.
3. Add plan-level coherence and summary coverage validation.
4. Preserve attribution chains and label inference.
5. Remove duplicate full-tweet rendering.

### P1 — improve editorial distinctiveness

1. Role-based selection of community commentary.
2. Explicit continuity IDs and novelty scoring.
3. A better candidate triage surface with completeness warnings and omission reasons.
4. Optional, substantive editor notes.

### P2 — learn from readers and editors

Track summary-to-story clicks, raw-conversation expansion, repeat visits, newsletter conversion, editor correction rate, and how often the editor rejects a proposed cluster. Those measures are more useful than raw generation success because the current system already succeeds structurally.

## Bottom line

The Digest should optimize for **editorial gain per source**, not for using every banger or filling a fixed number of boxes. Its unique advantage is not comprehensive news coverage; it is a community-weighted view with unusually inspectable provenance. A stronger setup would make that point of view clearer while becoming more conservative about what the source corpus actually supports.
