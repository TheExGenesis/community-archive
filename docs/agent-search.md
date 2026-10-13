# Ask the archive (agentic search)

`/search/ask` lets an opted-in member with an uploaded archive ask a question
about members' tweets. An agent searches the archive through the ClickHouse
gateway, follows threads and quote posts, scores candidates, and streams an
answer whose claims cite tweets inline. The page renders the cited tweets with
`TweetCard`, the other posts the search found, and a coverage note.

## How a question runs

1. `POST /api/agent-search` checks the viewer (`src/lib/agentSearch/eligibility.ts`),
   then admits the question (`budget.ts`, `runStore.ts`): one database call
   (`agent_search_admit`) checks that nobody else owns the conversation, the
   member's daily and monthly counts and running run, and the global daily
   spend, and
   stores the run as `running` under a search run id (`asr_…`) the server
   picked. Two requests can never both take the last slot, and a store error
   refuses the question. Only then does the route start the
   `agentSearchWorkflow` (`src/workflows/agentSearch.ts`), record its workflow
   run id on the row, and stream it back with the search run id in the
   `x-workflow-run-id` header. Before admission it closes the member's runs
   whose workflow already ended without recording a result (`runs.ts`).
   `GET /api/agent-search/{runId}/stream` lets a refreshed page reconnect, and
   `POST /api/agent-search/{runId}/cancel` (the page's Stop button) cancels the
   workflow and closes the run record; only the asker can read or stop a run.
   A Stop pressed before the page has the run id is held until the id
   arrives, and a run closed while it was starting is stopped by the start
   route or by the workflow's first step. Both stream responses always end
   with a `finish` chunk (`stream.ts`), because the page's transport keeps
   reconnecting until it sees one: a cancelled run's stream is never closed
   (seen locally: the start route's stream stayed open until its 300 s limit
   after a Stop), so while a read waits the route checks the workflow's
   status every 5 s and finishes once the run is over; a cancelled or expired
   run (`RunExpiredError`) answers a reconnect with a finish alone. `vercel.json` sets `supportsCancellation` on the reconnect
   route so a closed tab ends its function; the start route is left without
   it, since it must finish recording the workflow run once admitted.
2. The workflow runs AI SDK 7's `WorkflowAgent` with one tool, `bash`
   (`src/lib/agentSearch/agent.ts`): the model writes command lines and the
   archive's results come back as files in a shell workspace (see
   [The workspace](#the-workspace)). Each command is a durable step. Every
   archive read goes through the gateway (`gateway.ts`), which applies
   opt-outs. The page receives the command's summary, the tweet files it
   wrote and the tweets it touched; the model receives only stdout, capped at
   about 4,000 characters, and the exit code. `AGENT_SEARCH_TOOLS=typed`
   switches back to the earlier typed tools (`find_people`, `search_tweets`,
   `semantic_search`, `collect_and_score`, `score_tweets`, `get_thread`,
   `get_quote_posts`, `get_tweets`, implemented in `toolImpl.ts`), which pass
   compact tweets to the model.
3. The agent starts with keyword searches, adding semantic search for ideas
   phrased many ways. When a question's answer is a set of posts and the
   searches are too many and too noisy to read, it collects a file of
   candidates (up to 1,000) and scores each one against a yes/no criterion
   (`classifier.ts`). The default scorer is OpenAI's Decisions API (one
   `predicate` question per post, 48 requests at a time); Jev through
   OpenRouter and an LLM with structured output are alternatives. Replies are
   scored with their parent's text.
4. The answer cites single tweets as `[[t:<id>]]` (alone on a line, the tweet
   shows whole), quotes them as `[[q:<id> | exact words]]` (checked word for
   word), and shows sets of tweets as lists,
   `[[posts: <label> | lists/<name>.jsonl | <view>]]` (a workspace file) or
   `[[posts: <label> | <id>, <id>]]`. The label may be empty (a short list
   inside the prose, no heading). The view (`listView.ts`) is the agent's
   default: tweets, `by author`, `people`, or `people, <n> each`; readers can
   switch between tweets and people. A citation or listed tweet counts only
   if its id came back from a tool in the same conversation, in this run or an
   earlier turn (`citations.ts`); a list's file resolves to the ids the
   command that wrote it reported. The page marks other ids as unverified and
   the run record lists them. The page and the stored run apply the same rule.
5. The last step stores the run (`runStore.ts`): question, answer, cited and
   invalid ids, and tool calls. The answer is the last model step's text. A
   run of up to 20 model steps may not call tools on its last step, so it
   always ends with an answer. A model error, or a finish other than `stop`
   (cut off at the token limit, content filter), marks the run `failed` with
   the reason in `error`; any partial answer is kept and shown as unfinished.
   Two steps in a row in which every tool call failed (the archive is down)
   end the run with that error.

## The workspace

The shell is [just-bash](https://www.npmjs.com/package/just-bash), a bash
interpreter in TypeScript with an in-memory file system: no network, no
processes, no python or node, and the `hardened` execution limits (90 s per
command, bounded by the run's deadline; 8 MB of output; 64 MB of files). Its
usual tools (`jq`, `grep`, `sort`, `uniq`, `wc`, `head`, `cut`, `awk`, `sed`)
work on files under `/work`, and archive commands are added
(`src/lib/agentSearch/workspace/commands.ts`):

| Command | Does |
|---|---|
| `search <words> [--any w1,w2] [--all] [--from @h] [--reply-to @h] [--since D] [--until D] [--sort …] [--limit N]` | Keyword search; JSONL tweets to stdout (50 by default, up to 1,000) |
| `semantic "<idea>" [--from @h] [--k N] [--threshold 0-1]` | Meaning search (below); rows carry `distance` |
| `people <name or handle>` | Members and accounts matching a name |
| `score <file> "<yes/no question>" [--no-parent]` | Scores every tweet in a file; rows gain `p`, best first |
| `thread <id>`, `quotes <id>`, `tweets <id…>`, `read <id>` | A thread, quote posts, tweets by id (also from stdin), one tweet in full with its quoted tweet |

A tweet file is JSONL, one tweet per line: `id`, `author`, `date`, `likes`,
`reposts`, `replyTo`, `quotes`, `media`, `p` when scored, and `text`. Each
command writes a one-line summary to stderr (`search “x”: 120 tweets · 85
authors · 2023-01 to 2025-06 · more exist`), which the model sees, and a
shorter one for the page (`Searched “x” · 120 tweets`).

Each command runs in a fresh shell, because a workflow step may run in
another process. Between commands, and between turns of a conversation, the
workspace is carried as a manifest (`workspace/manifest.ts`): for each tweet
file, its ids in order with `p` and up to 8 short fields the agent added (a
group label, say), never tweet text. A file is rebuilt only when a command
reads it, by fetching its ids through the gateway again, so a tweet whose
author has opted out since drops out. Other files (counts, notes) are carried
as text for the rest of the run (up to 20,000 characters) but are never
stored with the answer, since they may hold tweet text.

Each command's output reports the changes it made (`workspace`) and the ids in
each tweet file it wrote (`files`). The stored run keeps the summary, exit
code, `files`, tweet-file changes and tweet ids (`history.ts`), never stdout,
stderr or notes. A follow-up rebuilds the workspace by replaying the earlier
turns' changes in order, and its question lists those files.

## Semantic search

`semantic` (and the typed `semantic_search`) calls the Tweetstack embeddings
API (`POST https://embed.tweetstack.app/embeddings/search`, Qwen3-Embedding-4B
over the archive; `semantic.ts`). It takes about 13–14 seconds, so it is
limited to 2 calls per run; a third returns an error telling the agent to use
keyword search. Its timeout is bounded by the run's deadline. The API returns
tweet ids with a distance; the metadata text it also returns is never used.
The ids are fetched again through the gateway, keeping the API's order and
distance, so opt-outs and deletions apply. A failed semantic call does not
count as the archive being down.

The prompt steers semantic search to paraphrased ideas, surveys and
investigative questions, and keyword search to names, handles, exact phrases
and dates; the two are combined by merging files and scoring.

Before release, the maintainer of the API should confirm how it handles
opt-outs (the re-fetch drops opted-out tweets from results, but the index may
still match them) and how fresh its index is.

## Cost

Spend is recorded as it happens, so the global daily cap counts runs still in
progress and a stopped or failed run keeps what it spent (`usage.ts`):

- Each planner call adds its tokens and estimated cost to the run inside the
  model step, as soon as the provider reports usage (`EnvLanguageModel` with a
  run id). A failed write fails the call.
- The shell's `score` (and the typed `collect_and_score` and `score_tweets`)
  add their scorer cost before they return or throw. A scorer that fails
  part-way throws a `ScoringError` carrying the cost of the calls that
  succeeded. Shell commands and these two tools are never retried, since a
  retry pays for all the scoring again; gateway-only tools retry once.
  Semantic search has no charge.
- Writes are increments (`agent_search_add_usage`), so concurrent steps of one
  run never overwrite each other, and status updates never touch spend.
- A run does not start when the planner, or the `llm` scorer, has no price or
  a malformed price override; the route answers 503.

Prices are standard-tier, short-context list prices; long-context surcharges
are not modelled.

## History

A question and its follow-ups form a conversation, keyed by the page's chat id
(`?c=<id>` in the URL). Each run stores its `conversation_id` and the answer as
UI message parts (`parts`), built in `history.ts` with every tweet reduced to
its id. Workflow keeps a run's own data only 7 days after it ends on Vercel Pro
(1 day on Hobby), so history never replays the event log.

- `GET /api/agent-search/conversations` lists the viewer's recent conversations.
- `GET /api/agent-search/conversations/{id}` rebuilds one: it fetches the
  referenced tweets again through the gateway (`historyTweets.ts`), so a post
  whose author opted out since drops out of old answers. People lookups keep
  only handles, not bios. A run still answering is reconnected through its
  stream.
- The start route refuses a conversation id that belongs to someone else.

### Follow-up questions

The page sends only `{ id, question }`. The server never takes earlier turns
from the browser: the workflow's first step (`context.ts`) rebuilds them from
the asker's stored runs of that conversation, fetching their tweets again
through the gateway. Tool outputs are converted with the tool definitions, so
each one is compacted by its `toModelOutput` as when the model first saw it,
and a tool call left without a result by a Stop is ignored. The model sees the
last 3 earlier turns (`MAX_CONTEXT_TURNS`); the page shows the whole
conversation. Citations may use tweets from any earlier turn. Stored shell
commands come back as their summary and the files they wrote, and the
workspace is rebuilt from every earlier turn's tweet files, so a follow-up
can work on `lists/` from the last answer.

Models cross Workflow step boundaries as `EnvLanguageModel`, which serializes
only its `provider:model` spec. Provider models would otherwise serialize their
resolved headers, including the API key, into the event log.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `AGENT_SEARCH_MODEL` | `openrouter:deepseek/deepseek-v4.1-flash` | Planner (`openai:` or `openrouter:` spec); `openai:gpt-6.1-sol` is the alternative |
| `AGENT_SEARCH_TOOLS` | `bash` | `typed` gives the agent the earlier typed tools instead of the shell. A run keeps the mode it started with |
| `SEMANTIC_SEARCH_URL` | `https://embed.tweetstack.app/embeddings/search` | Semantic search endpoint |
| `OPENROUTER_API_BASE_URL` | `https://openrouter.ai/api/v1` | OpenRouter base URL (the Daily Digest's name); falls back to `OPENROUTER_BASE_URL`, then the default |
| `AGENT_SEARCH_SCORER` | unset | `decisions`, `jev` or `llm`. Unset: Decisions with an OpenAI key, else Jev with an OpenRouter key, else the LLM |
| `AGENT_SEARCH_SCORER_MODEL` | `openai:gpt-6-luna` | Model for the `llm` scorer |
| `AGENT_SEARCH_SCORER_REASONING` | `low` | `llm` scorer reasoning effort (`none`, `low`, `medium`, `high`) |
| `OPENAI_API_KEY` / `OPENROUTER_API_KEY` | | Provider keys; OpenRouter calls send `data_collection: deny, zdr: true` |
| `AGENT_SEARCH_DAILY_LIMIT` | `10` | Questions per member per UTC day |
| `AGENT_SEARCH_MONTHLY_LIMIT` | `30` | Questions per member per UTC month, counted like the daily limit; the page shows whichever runs out first |
| `AGENT_SEARCH_GLOBAL_DAILY_USD` | `25` | Global daily spend kill switch |
| `AGENT_SEARCH_RUN_DEADLINE_MS` | `300000` | A run's time limit: after it no gateway or scorer call starts, each call's timeout is cut to the time left, and the next model step must answer without tools |
| `AGENT_SEARCH_STALE_RUN_MS` | `600000` | When a running run stops blocking a new one; never less than the deadline plus 2 minutes. A run whose workflow has ended stops blocking at once |
| `AGENT_SEARCH_INPUT_USD_PER_MTOK`, `AGENT_SEARCH_OUTPUT_USD_PER_MTOK`, `AGENT_SEARCH_CACHED_INPUT_USD_PER_MTOK` | price table | Planner prices. Required for any model not in `MODEL_PRICES_USD_PER_MTOK`, including every `openrouter:` model. Cached input defaults to the input override when only that is set |
| `AGENT_SEARCH_SCORER_INPUT_USD_PER_MTOK`, `..._OUTPUT_...`, `..._CACHED_INPUT_...` | price table | Same for the `llm` scorer (Decisions is priced at $0.10 per million input tokens; Jev reports its own cost) |
| `AGENT_SEARCH_RUN_STORE` | file outside production | `file` forces the local JSON store |
| `AGENT_SEARCH_KEY_SECRET` | unset | At least 32 characters. Seals members' own OpenRouter keys (below); unset, own keys are refused |

The default planner runs on OpenRouter, so `OPENROUTER_API_KEY` must be set in
Production and Preview. It is the same key the Daily Digest uses
(`docs/daily-digest.md`). The default scorer stays on OpenAI Decisions
(`OPENAI_API_KEY`).

### A member's own OpenRouter key

A member may pay for their questions with their own OpenRouter key and ask ten
times the daily and monthly limits (`AGENT_SEARCH_DAILY_LIMIT` x 10 and
`AGENT_SEARCH_MONTHLY_LIMIT` x 10, counting all of that day's or month's
questions; house questions keep their own counts). They add it from the
"N left today" popover or the Ask the archive section in Settings.

- **Where it lives.** In the member's browser (localStorage). The page sends it
  with each question in the `x-openrouter-key` header. The server keeps no copy,
  so there is no key table to leak.
- **Before a run.** The start route checks it with OpenRouter
  (`GET /api/v1/key`) and refuses a key that is invalid, free tier, a management
  key, or out of limit or budget, with a code the page explains
  (`own_key_*`).
- **In the workflow.** Workflow inputs and step arguments are kept in the
  event log, so the route seals the key first: AES-256-GCM under
  `AGENT_SEARCH_KEY_SECRET`, with the run id as authenticated data
  (`ownKey.ts`). Only the sealed text crosses steps; the model step opens it
  just before each call. A refusal by OpenRouter mid-run (401, 402, 403, 429)
  fails the run with a plain message; it never falls back to the house key.
- **Spend.** The run records `key_source = 'own'`. Planner calls on the
  member's key add tokens but no cost, so `cost_usd` and the global daily cap
  count house spend only. The scorer and the semantic search still run on the
  house, so own-key questions still stop when the global cap is reached.

The gateway variables (`CLICKHOUSE_SEARCH_API_URL`, `CLICKHOUSE_ANALYTICS_API_URL`,
`CLICKHOUSE_ANALYTICS_API_TOKEN`) are the site's existing ones. The route sets
`maxDuration = 300`; the repository default is 15 seconds.

## Run storage

Production stores runs in `public.agent_search_runs`
(`supabase/migrations/20261008120000_agent_search_runs.sql`), written with the
service-role client; RLS is on with no user grants. Two functions, also
service role only, do the writes that must be atomic:
`agent_search_add_usage` (`20261009120000_agent_search_usage.sql`) and
`agent_search_admit` (`20261009130000_agent_search_admission.sql`, which also
adds `workflow_run_id`). Outside production the store is JSON files under
`.agent-search-runs/` (git-ignored) with the same rules, so local development
never writes production Supabase. The migrations must be applied to production
by hand before release (see AGENTS.md).

## Local development

Without production gateway credentials, use the local ClickHouse and gateway
stand-in described in `~/ca-local/README.md` (loaded from the public Parquet
export). Then:

    env $(grep -v '^#' ~/ca-local/gateway/site.env | xargs) OPENAI_API_KEY=... pnpm dev

Visit `/search/ask?as=member`: in development the member preview cookie acts as
an eligible viewer with account `dev`. It is ignored outside development.

## Evaluation

`scripts/agent-search/` holds a 30-question set across six kinds of question
(answer keys are tweet ids) and a runner that uses the same agent in-process.
See `scripts/agent-search/README.md`.
