# Single-call Daily Digest generation

Date: 2026-08-13

## Decision

Generate each Daily Digest with exactly one structured model call over a frozen,
zero-indexed corpus. The source set is the top
`min(50, num_bangers_over_2_ca_quotes)` bangers from the rolling 24-hour
window: only bangers with at least three distinct non-self Community Archive
quote posts qualify, and the request never contains more than 50 bangers.

Each qualifying banger is enriched before generation with bounded surrounding
context:

- up to twelve Community Archive quote posts from ClickHouse;
- up to eight in-window conversation replies from the existing Supabase
  tweet-page RPC;
- full tweet snapshots remain in the run ledger, while the prompt carries a
  compact author/text/date/engagement representation.

Bangers occupy indices `0..N-1` in source-rank order. Replies and quote posts
follow, each with a `parent_banger_index`. The prompt never asks the model to
copy tweet IDs. The receiver rebuilds the same deterministic corpus, validates
every returned integer, and converts indices back to immutable tweet snapshots.

## Output contract

The single response contains:

- `executive_summary`: three to five bullets, borrowing original tweet language
  wherever clarity permits;
- `representative_tweet_index`: normally banger index `0`, but another tweet may
  be chosen when it is more representative or iconic;
- `stories`: three to five objects with a loose `category`, verbatim-excerpt
  `title`, explanatory roughly 140-character `subtitle`, `bullets`,
  `editorial_note`, and `tweet_indices`;
- `keywords`: three to twelve exact words or phrases found in the corpus.

The receiver rejects unknown indices, a story without a banger, duplicate
banger assignment, fabricated title text, subtitles without enough context, and
keywords absent from the corpus. The public “Representative tweet” slot uses
the model's validated choice; the stored `topBanger` field name remains for
backward compatibility with older editions.

## Provider

Prompt version `Single-call indexed DeepSeek digest` uses
`deepseek-v4-pro` through DeepSeek's Responses API and JSON-schema output. Model
names beginning with `deepseek-` use the server-only `DEEPSEEK_API_KEY` and
`DEEPSEEK_API_BASE_URL`; older OpenAI prompt versions continue to use their
existing credentials. The run ledger stores the rendered indexed prompt, raw
provider response, resolved model, token usage, duration, and validated edition.

The generation adapter performs one provider request and no hidden repair or
retry call. A provider or validation failure remains a failed, inspectable run.
