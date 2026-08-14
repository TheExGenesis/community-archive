# Daily Digest generation readiness

Date: 2026-08-14 00:45 PDT

## Outcome

`deepseek/deepseek-v4-flash-0731` is suitable for a one-call Daily Digest trial
through OpenRouter. Five isolated calls against the August 11 fixture all
returned structurally valid, grounded editions with five stories. Four met the
short-copy targets without warnings; one used a clear paraphrased title and was
accepted with an editorial warning.

The production-shaped receiver treats malformed JSON, nonexistent indices,
duplicate banger assignments, missing bangers, invalid categories, and
ungrounded keywords as hard failures. Exact-title and copy-length preferences
are non-fatal review notes.

## Evaluation

- Model: `deepseek/deepseek-v4-flash-0731`
- Route: OpenRouter Chat Completions with strict JSON Schema
- Privacy routing: zero-data-retention required and data-collection providers denied
- Corpus: 13 ranked bangers and 14 reply/quote-context posts
- Prompt size: 18,331 characters; 6,009 input tokens per measured call
- Result: 5/5 passed structural and grounding validation
- Stories: five in every run
- Latency: 23.1–25.4 seconds; median 24.9 seconds
- Output: 1,276–1,401 tokens
- Editorial warnings: one paraphrased title across five calls

The complete immutable evidence, including provider response IDs, hashes,
usage, warnings, and raw outputs, is in
`memos/artifacts/20260814-deepseek-v4-flash-digest-eval-v4.json`.

Earlier evaluation artifacts are intentionally retained. They document why
network requests were isolated and why stylistic title deviations became
warnings rather than failed generations.

## Runtime design

An authenticated administrator can choose one of the prior seven completed
Pacific calendar days. The server resolves the exact midnight-to-midnight UTC
window, queries at most 50 qualifying bangers, persists the frozen source
snapshot, fetches bounded reply and quote context, makes one model call, saves
the raw response before validation, then saves the parsed edition. Staging and
publication remain explicit editorial actions.

The OpenRouter adapter requires structured output, low hidden reasoning, ZDR,
and denied provider data collection. The API key remains server-only. Preview
development uses a Git-branch-scoped Vercel secret.

## Observability

- Every generation has a durable run ID, event trace, model response ID,
  duration, token counts, raw response, parsed output, and error.
- PostHog receives aggregate `digest_generation_requested` and
  `digest_page_created` events. No tweet IDs, prompts, post text, response text,
  or digest dates are sent.
- Grafana reads only a security-definer aggregate: completions, failures,
  active runs, p95 duration, total tokens, last completion, and latest staged
  page. The exporter does not receive direct access to digest tables.
- The Grafana warning covers failed runs and overlapping active generations.
  Page freshness remains informational until a scheduler exists.

## Rollout boundary

Historical generation depends on the query gateway accepting an optional
exclusive `end` timestamp for its bounded banger window. Deploy and verify the
gateway change before enabling the date buttons in a shared preview. Apply the
website digest migrations before the aggregate Grafana function, then deploy
the monitoring configuration and publish the dashboard and alert.
