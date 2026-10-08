# Agent search evaluation

A fixed question set with answer keys, and a runner that puts each question to the
agentic-search agent in-process (same tools, instructions and step limit as the workflow)
and scores the answer.

Files:

- `questions.json`: 30 questions, 5 per class. Only ids, SQL and short notes; no tweet text.
- `build-questions.py`: rebuilds `questions.json` from local ClickHouse. Curated keys
  live in the script; SQL keys are recomputed. Run it after loading a new export.
- `eval.ts`: the runner. `results/` (gitignored) gets one `<timestamp>.json` and
  one `<timestamp>.md` per run.
- `tsconfig.json`: maps `@/*` to `src/*` and `server-only` to `jest.server-only.js` so
  server modules load outside Next.

## Running

Start local ClickHouse and the gateway stand-in first (`~/ca-local/README.md`):

    cd ~/ca-local/clickhouse && docker compose up -d
    cd ~/ca-local/gateway && uv run --no-project gateway.py

Then, from the repo root:

    # free: checks env, imports and keys against the gateway, no model calls
    node_modules/.bin/tsx --tsconfig scripts/agent-search/tsconfig.json scripts/agent-search/eval.ts --dry-run

    # one question, or a class, or the first N
    node_modules/.bin/tsx --tsconfig scripts/agent-search/tsconfig.json scripts/agent-search/eval.ts --only recall-future-historians
    node_modules/.bin/tsx --tsconfig scripts/agent-search/tsconfig.json scripts/agent-search/eval.ts --class person-centric,time-bounded
    node_modules/.bin/tsx --tsconfig scripts/agent-search/tsconfig.json scripts/agent-search/eval.ts --limit 5 --concurrency 2

Other flags: `--model provider:model` (default `AGENT_SEARCH_MODEL` or `openai:gpt-6.1-sol`),
`--timeout-ms` (per question, default 300000), `--questions <file>`, `--no-validate-keys`,
`--allow-remote-gateway`.

Environment: the script reads `~/ca-local/gateway/site.env` (override the path with
`AGENT_SEARCH_GATEWAY_ENV`) and takes only `OPENAI_API_KEY` from `.env.local`, so
production settings in `.env.local` never reach a run. Variables already set in the shell
win. It refuses a gateway URL that is not localhost unless `--allow-remote-gateway` is
passed. The scorer used by `collect_and_score` / `score_tweets` follows
`AGENT_SEARCH_SCORER_MODEL` (else the agent model spec); with no `OPENROUTER_API_KEY` it is
the LLM fallback, not Jev.

Cost: a full run is 30 agent loops plus classifier calls. One smoke-test question used
about 63k input and 0.6k output tokens with `gpt-6.1-sol`. Run a class or `--limit` first.

## Question classes and keys

| class | keyType | key |
|---|---|---|
| recall-a-tweet | exact | the one tweet (≥20 likes, ≥12 words, not a reply), asked about in paraphrase |
| survey | partial | hand-picked on-topic tweets from a small SQL pool (`poolSql`) |
| investigative | partial | the benchmark key from `research/pilot/findings.md` (members only), plus hand-built keys from thread walks and pools |
| person-centric | exact | every non-retweet by the handle matching a word set (`sql`) |
| time-bounded | exact | every non-retweet in a UTC month matching a word set (`sql`) |
| ambiguous-term | judged | `expect: 'clarify' or 'resolve'`, plus optional example ids |

Exact SQL keys are capped at 200 ids (`capped: true` would say the cap was hit; none are
today). Before each question the runner re-fetches the key ids through the gateway and
drops any that no longer resolve, so opt-outs leave the key; dropped ids are reported.

## Metrics (per question, in the JSON and the table)

- **recall cited**: share of key ids the answer cites.
- **recall found**: share of key ids that appeared in any tool result, whether or not
  cited. The gap between the two is what the agent saw but left out.
- **precision**: share of cited ids that are in the key. Exact keys only; for partial
  keys the cited-outside-key count is shown instead, because those ids are unjudged.
- **invalid**: citation markers whose id never appeared in a tool result
  (`validateCitations` against `collectToolTweetIds` of all tool outputs). The by-class
  table reports them as a rate of all markers.
- **call N** (recall-a-tweet): which tool call first returned the target tweet.
- **asked** (ambiguous-term): whether the last paragraph ends in a question. A rough
  flag; read the answer against `expect` and the notes.
- Per question the JSON also keeps the answer, every tool call (name, input, latency,
  tweet count, top-level counts, error), tokens, classifier cost, wall time and errors.

## Caveats

- The local export has members' tweets only. Threads lack non-member replies, and the
  benchmark's three non-member critics (and one member tweet absent from the export) are
  left out of its key. Numbers here will differ from a run against the production gateway.
- Partial keys are lower bounds of the truth, built by one judge from small pools
  (`notes` says how). Recall against them says whether the agent finds the obvious
  posts; it says nothing about posts outside the pool.
- Exact person-centric and time-bounded keys are lexical: substring matches on a word
  set. Some key ids are off-topic and some on-topic posts use none of the words. Their
  keys run to 14–173 ids, so recall cited stays low by design (an answer cites a
  handful); recall found and precision are the more useful numbers there.
- Recall-a-tweet questions avoid the tweet's words on purpose, so a search engine that
  only matches substrings has to guess the wording (`Greece` does not match `greek`).
- The agent's instructions include today's date, so runs on different days are not
  byte-identical. Model output is not deterministic; compare runs over several questions.
