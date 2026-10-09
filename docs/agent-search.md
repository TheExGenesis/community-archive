# Ask the archive (agentic search)

`/search/ask` lets an opted-in member with an uploaded archive ask a question
about members' tweets. An agent searches the archive through the ClickHouse
gateway, follows threads and quote posts, scores candidates, and streams an
answer whose claims cite tweets inline. The page renders the cited tweets with
`TweetCard`, the other posts the search found, and a coverage note.

## How a question runs

1. `POST /api/agent-search` checks the viewer (`src/lib/agentSearch/eligibility.ts`)
   and the budget (`budget.ts`), then starts the `agentSearchWorkflow`
   (`src/workflows/agentSearch.ts`) and streams it back with an
   `x-workflow-run-id` header. `GET /api/agent-search/{runId}/stream` lets a
   refreshed page reconnect, and `POST /api/agent-search/{runId}/cancel` (the
   page's Stop button) cancels the workflow and closes the run record; only the
   asker can read or stop a run.
2. The workflow runs AI SDK 7's `WorkflowAgent`. Each tool call is a durable
   step. Tools (`src/lib/agentSearch/agent.ts`, implemented in `toolImpl.ts`):
   `find_people`, `search_tweets`, `collect_and_score`, `score_tweets`,
   `get_thread`, `get_quote_posts`, `get_tweets`. They read only through the
   gateway (`gateway.ts`), which applies opt-outs. The page receives full tweet
   objects; the model receives a compact form (`toModelOutput`).
3. The agent starts with keyword searches. When a question's answer is a set of
   posts and the searches are too many and too noisy to read, `collect_and_score`
   pulls matching posts (300 by default, up to 1,000 when the agent asks) and
   scores each one against a yes/no criterion (`classifier.ts`). The default
   scorer is OpenAI's Decisions API (one `predicate` question per post, 48
   requests at a time); Jev through OpenRouter and an LLM with structured output
   are alternatives. Replies are scored with their parent's text. The result
   says when the limit cut the collection short.
4. The answer cites tweets as `[[t:<id>]]`. A citation counts only if the id
   came back from a tool in the same run (`citations.ts`); the page marks other
   ids as unverified and the run record lists them.
5. The last step stores the run (`runStore.ts`): question, answer, cited and
   invalid ids, and tool calls. The answer is the last model step's text. A
   run of up to 20 model steps may not call tools on its last step, so it
   always ends with an answer. A model error, or a finish other than `stop`
   (cut off at the token limit, content filter), marks the run `failed` with
   the reason in `error`; any partial answer is kept and shown as unfinished.

## Cost

Spend is recorded as it happens, so the global daily cap counts runs still in
progress and a stopped or failed run keeps what it spent (`usage.ts`):

- Each planner call adds its tokens and estimated cost to the run inside the
  model step, as soon as the provider reports usage (`EnvLanguageModel` with a
  run id). A failed write fails the call.
- `collect_and_score` and `score_tweets` add their scorer cost before they
  return or throw. A scorer that fails part-way throws a `ScoringError`
  carrying the cost of the calls that succeeded. These two steps are never
  retried, since a retry pays for all the scoring again; gateway-only tools
  retry once.
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

Models cross Workflow step boundaries as `EnvLanguageModel`, which serializes
only its `provider:model` spec. Provider models would otherwise serialize their
resolved headers, including the API key, into the event log.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `AGENT_SEARCH_MODEL` | `openai:gpt-6.1-sol` | Planner (`openai:` or `openrouter:` spec) |
| `AGENT_SEARCH_SCORER` | unset | `decisions`, `jev` or `llm`. Unset: Decisions with an OpenAI key, else Jev with an OpenRouter key, else the LLM |
| `AGENT_SEARCH_SCORER_MODEL` | `openai:gpt-6-luna` | Model for the `llm` scorer |
| `AGENT_SEARCH_SCORER_REASONING` | `low` | `llm` scorer reasoning effort (`none`, `low`, `medium`, `high`) |
| `OPENAI_API_KEY` / `OPENROUTER_API_KEY` | | Provider keys; OpenRouter calls send `data_collection: deny, zdr: true` |
| `AGENT_SEARCH_DAILY_LIMIT` | `10` | Questions per member per UTC day |
| `AGENT_SEARCH_GLOBAL_DAILY_USD` | `25` | Global daily spend kill switch |
| `AGENT_SEARCH_STALE_RUN_MS` | `600000` | When a running run stops blocking a new one |
| `AGENT_SEARCH_INPUT_USD_PER_MTOK`, `AGENT_SEARCH_OUTPUT_USD_PER_MTOK`, `AGENT_SEARCH_CACHED_INPUT_USD_PER_MTOK` | price table | Planner prices. Required for any model not in `MODEL_PRICES_USD_PER_MTOK`, including every `openrouter:` model. Cached input defaults to the input override when only that is set |
| `AGENT_SEARCH_SCORER_INPUT_USD_PER_MTOK`, `..._OUTPUT_...`, `..._CACHED_INPUT_...` | price table | Same for the `llm` scorer (Decisions is priced at $0.10 per million input tokens; Jev reports its own cost) |
| `AGENT_SEARCH_RUN_STORE` | file outside production | `file` forces the local JSON store |

The gateway variables (`CLICKHOUSE_SEARCH_API_URL`, `CLICKHOUSE_ANALYTICS_API_URL`,
`CLICKHOUSE_ANALYTICS_API_TOKEN`) are the site's existing ones. The route sets
`maxDuration = 300`; the repository default is 15 seconds.

## Run storage

Production stores runs in `public.agent_search_runs`
(`supabase/migrations/20261008120000_agent_search_runs.sql`), written with the
service-role client; RLS is on with no user grants. Outside production the store
is JSON files under `.agent-search-runs/` (git-ignored), so local development
never writes production Supabase. The migration must be applied to production
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
