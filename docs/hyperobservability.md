# Hyperobservability: phase 0

Goal: everything production says is readable by an agent, in text, in one
place, with enough context to replay it. This is the first stage of the loop
described in `memos/20261029-1830-autonomous-fleet-roadmap.md` and revised in
`memos/20261030-fleet-v2-direct-to-main-and-infra.md`. Phase 1 (the fixer
and the canary, below) builds on the contracts here.

## The three pieces

| Piece                    | Where                                                                   | What it does                                                                                                                                                                                                                                         |
| ------------------------ | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server exception capture | `src/instrumentation.ts`, `src/lib/observability/serverErrorCapture.ts` | Every unhandled error in a route handler, server component, action or middleware is sent to PostHog error tracking, fingerprinted and grouped like browser exceptions already are. Node runtime only; the edge runtime logs the same line and stops. |
| Replayable API errors    | `src/lib/observability/apiError.ts`                                     | `reportApiError` turns a handled 5xx into one JSON log line (`kind: "api_error"`), a PostHog exception, and a response whose body carries `request_id`.                                                                                              |
| Signal inbox             | `src/app/api/signals/[source]/route.ts`, `src/lib/signals/`             | Webhooks from PostHog, Grafana, the Vercel log drain, the autorefresh host and scripts become GitHub issues labelled `signal`, one per fingerprint.                                                                                                  |

Nothing here changes what PostHog collects from browsers. Server events carry
no bodies, headers, cookies, query strings, IPs or user ids; the only
user-related field is `user_state` (`guest`, `signed_in`, `unknown`), read
from the presence of a Supabase auth cookie and nothing else.

## Environment

| Variable                                                        | Scope    | Purpose                                                                                                                                     |
| --------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`, `NEXT_PUBLIC_POSTHOG_HOST` | existing | Reused by the server SDK. No token means no server capture.                                                                                 |
| `SERVER_ERROR_CAPTURE=off`                                      | server   | Keep server exceptions out of PostHog; log lines still emit.                                                                                |
| `SIGNALS_WEBHOOK_SECRET`                                        | server   | Bearer token every source sends. Also the Vercel drain secret (HMAC-SHA1 of the body in `x-vercel-signature`).                              |
| `SIGNALS_GITHUB_TOKEN`                                          | server   | Fine-grained token with Issues read/write on the product repo. Unset: the route accepts, logs `kind: "signal_unrouted"`, and files nothing. |
| `SIGNALS_GITHUB_REPO`                                           | server   | Defaults to `TheExGenesis/community-archive`.                                                                                               |

Setting these in Vercel is a production configuration change: Tier 1 in the
roadmap, so a human does it.

## The log line contract

Handled API failures:

```json
{
  "level": "error",
  "kind": "api_error",
  "ts": "2026-10-29T18:40:00.000Z",
  "request_id": "iad1::k7s2d-1761763200000-3f1a",
  "route": "/api/tweet-search",
  "method": "GET",
  "status": 502,
  "upstream": "gateway",
  "user_state": "guest",
  "error": { "name": "TypeError", "message": "fetch failed" },
  "message": "Tweet search is temporarily unavailable"
}
```

Unhandled errors (from `onRequestError`) use `kind: "unhandled_error"` and
add `router_kind`, `route_type`, `render_source` and `revalidate_reason`.

`route` is the route pattern, never the request URL. `upstream` is one of
`supabase`, `gateway`, `clickhouse`, `twitter`, `modal`, `email`, `storage`,
`github`, `none`, `unknown`. `request_id` is Vercel's `x-vercel-id` when
present, so the same id finds the request in Vercel logs.

Adopting it in a route:

```ts
} catch (error) {
  return reportApiError({
    request,
    route: '/api/user-directory',
    status: 502,
    message: 'The user directory is temporarily unavailable',
    upstream: 'gateway',
    error,
  })
}
```

Routes converted so far: tweet-search, portal/stream, hex-map/heat,
user-directory, tweet-counts, search/related, conversation-map, strands,
scraping-stats. The remaining 5xx `catch` blocks under `src/app/api` still
use bare `console.error`; convert them when you touch them. `public-data`
keeps its `message` body key on purpose, because the read bridge parses it.

## The signal contract

Every source is normalized to a `Signal` (`src/lib/signals/types.ts`) and
filed as an issue titled `[signal:<source>] <title>` with the `signal` label.
The body has a one-paragraph summary, a fenced `json signal` block that is
the machine-readable record, and an HTML comment `fp:<fingerprint>` used for
dedupe. A repeat of an open fingerprint is a comment, never a second issue.
A `resolved` signal comments on the open issue and is otherwise ignored.

Fingerprint = first 12 hex of sha256(`source|key`), where the key is stable
across repeats: PostHog issue id, Grafana alert fingerprint, Vercel
`route|status|error name`. Numeric ids and UUIDs in paths collapse to `:id`.

Reading the inbox as an agent:

```bash
gh issue list --label signal --state open --json number,title,body,createdAt
```

## Wiring each source

All sources POST to `https://www.community-archive.org/api/signals/<source>`
with `Authorization: Bearer <SIGNALS_WEBHOOK_SECRET>` unless noted. The
route caps a request at 512 KB and 20 signals.

### PostHog error tracking → `/api/signals/posthog`

Error tracking → Configuration → Alerting → New notification → Webhook, one
alert for the "issue created" trigger and one for "issue reopened". Headers:
`Authorization: Bearer <secret>` and `Content-Type: application/json`. Body:

```json
{
  "issue": {
    "id": "{event.distinct_id}",
    "name": "{event.properties.name}",
    "description": "{substring(event.properties.description, 1, 600)}",
    "status": "{event.properties.status}",
    "url": "{project.url}/error_tracking/{event.distinct_id}"
  },
  "side": "{event.properties.side}",
  "route": "{event.properties.route}",
  "exception_type": "{event.properties.$exception_types}"
}
```

`event.distinct_id` is the issue id on these alert events. `side` and
`route` are set for server exceptions and empty for browser ones; the
adapter also accepts the issue keys flattened at the top level.

### Grafana Cloud → `/api/signals/grafana`

Add a webhook contact point with the URL above and the bearer token in the
Authorization header, then route the ten rules in `ops/monitoring/alerts/`
(control-panel repo) to it. The standard Grafana alerting payload is read
as-is: `alertname`, `instance`, `service_id`, `check_id`, `severity` labels
and `summary`, `description`, `runbook_url` annotations. Resolved
notifications comment on the open issue.

### Vercel log drain → `/api/signals/vercel`

Project settings → Log Drains → add a drain with format `json` (or
`ndjson`), sources `lambda`, `edge`, `external`, and the drain secret set to
`SIGNALS_WEBHOOK_SECRET`. Vercel signs each delivery; no bearer header is
needed. Only 5xx responses and error-level lines become signals, grouped per
route per delivery. Lines produced by `reportApiError` are parsed, so the
issue carries `upstream`, `user_state` and the request id.

### Autorefresh host and scripts → `/api/signals/autorefresh`, `/api/signals/canary`, `/api/signals/generic`

One object or an array of:

```json
{
  "title": "Autorefresh run dropped 40% of fetched tweets",
  "key": "drop-rate",
  "severity": "critical",
  "state": "firing",
  "summary": "health_reports/2026-10-29T03.json: 1,912 of 4,780 tweets failed validation",
  "link": "https://ca-dashboard.duckdns.org/",
  "details": { "run": "2026-10-29T03:00:00Z", "dropped_ratio": 0.4 }
}
```

`key` is what makes repeats group; leave it stable per problem, not per run.

```bash
curl -sS -X POST "$CA_URL/api/signals/autorefresh" \
  -H "Authorization: Bearer $SIGNALS_WEBHOOK_SECRET" \
  -H 'content-type: application/json' \
  --data @signal.json
```

Humans file the same shape through the "Production signal" issue template.

## What phase 1 adds

Two bash harnesses under `fleet/` in this repository, run by user timers on
the `ca-fleet` host (control-panel repo, `ops/ca-fleet/`,
`docs/ca-fleet-operations.md`). The **fixer** takes the oldest open `signal`
or `bug` issue, has Claude Code reproduce, classify and fix it in a worktree,
runs the CI gate, ships (a PR by default, straight to `main` once trusted),
closes the loop on the issue and writes a learning. The **canary** fetches six
production URLs every 15 minutes, posts a signal to `/api/signals/canary` on
a new failure, and can roll production back to the previous Vercel
deployment. Neither needs Method; the canary uses no LLM at all. Details in
the next section; `fleet/README.md` has the operator reference.

## Phase 1: the fixer and the canary

### The fixer (`fleet/bin/fixer.sh`)

One run handles one issue:

1. Creates the `fleet:*` labels if missing, lists open `signal` and `bug`
   issues with `gh issue list --json number,title,body,labels,createdAt` and
   picks the oldest that carries none of `fleet:in-progress`,
   `fleet:needs-decision`, `fleet:wontfix`. Empty inbox: exits 0 with
   `outcome: idle`.
2. Labels it `fleet:in-progress` (read back), creates a git worktree from
   `origin/main` under the run directory with `node_modules` linked from the
   checkout.
3. Runs `claude -p` in that worktree with `fleet/prompts/fixer.md` plus the
   issue body on stdin, `--output-format stream-json --verbose`,
   `--max-turns 80`, `--permission-mode dontAsk`, `--allowedTools` Read,
   Edit, Write, Grep, Glob and Bash for lint/type-check/test commands and
   `git status|diff|log` only; `git push`, `git commit`, `gh`, `curl` and web
   tools are disallowed. The event stream (every assistant turn, tool call
   and tool result) is scrubbed of secrets and appended to
   `$RUN_DIR/transcript.jsonl`, rendered to `transcript.md`, and its final
   `result` event (session id, cost, tokens) is kept as `claude-output.json`.
4. Reads the verdict: the last fenced ` ```json ` block of the final message,
   `{classification, summary, root_cause, fix, check_next_time, files}`.
   - `wontfix` / `needs-decision`: comments the reasoning, swaps the label,
     removes the worktree. Done.
   - `bug`: stages the diff and checks it against Tier 0 (no `supabase/**`,
     opt-in/opt-out, email, data deletion, workflows, dependency files; no
     added service-role, consent, delete, key or email code; no renames;
     ≤ 300 changed lines). A violation becomes a `fleet:needs-decision`
     comment and the patch stays in the run directory.
   - No verdict: `fleet:needs-decision` with the tail of the agent's message.
     `is_error` from Claude (auth, API): the label is removed again and the
     run fails, because that is our failure, not the issue's.
5. Gate: `pnpm lint`, `pnpm type-check`, `pnpm test:security`, `pnpm test:ci`
   in the worktree, the same four checks as CI. On failure, one
   `claude -p --resume <session_id>` with the failing output, then the gate
   again; a second failure is a `fleet:needs-decision` comment.
6. Green: writes `memos/fleet/learnings/<date>-<issue>.md` (signal, root
   cause, fix, what to check next time) into the same change, commits as
   `[fleet:fixer] <summary> (signal #n)` with the Co-Authored-By line and
   `--no-verify` (the pre-commit hook regenerates production types).
   - `FLEET_MODE=pr`: pushes `fleet/fixer-<n>-<ts>`, opens a PR whose body
     contains `Fixes #n`, comments the PR link on the issue, swaps the label
     to `fleet:pr-open`.
   - `FLEET_MODE=main`: `git push origin HEAD:main`, closes the issue with a
     comment naming the commit, removes `fleet:in-progress`.
7. Reads back with `gh` that the PR is open (or the commit is on `main`) and
   that the issue shows the label and comment. If GitHub does not show it,
   the run exits non-zero.

A `mkdir` lock (`FLEET_LOCK_DIR`) makes a second concurrent fixer exit 0
with `outcome: locked`; the timer on `ca-fleet` also serialises runs.

**Reading a run.** Each run's `result.json` names the issue (`issue_url`,
`signal_fingerprint`), what shipped (`pr_url` or `commit_url`,
`learning_path`), the transcript (`transcript_path`, `transcript_url`) and
what it cost (`cost_usd`, `tokens`, `calls`); `fleet/README.md` lists the
fields. The harness then writes `loki.jsonl`, which Alloy on `ca-fleet` ships
to Grafana Cloud Loki with labels `routine`, `issue`, `outcome`, `run_id`
and `file`, so the Fleet dashboard's "Runs" row lists every run with links to
its issue, PR and transcript, and Explore shows a whole run with
`{job="fleet-runs", run_id="<run id>"}`. The fixer's issue comments and PR
bodies end with a Run line (run id, outcome, duration, cost, transcript
link when `FLEET_RUNS_EXPLORE_URL` is set). Before Grafana is wired, or on
the host, `fleet/bin/runs.sh list` and `fleet/bin/runs.sh show <run-id>`
print the same from the runs directory. Transcripts hold code and issue text,
never secrets (`fleet/lib/transcript.mjs scrub`), and never enter this
public repository; they live seven days on the host and as long as Loki
keeps them. Operator steps: control-panel `docs/ca-fleet-operations.md`,
section "Reading a run".

### The canary (`fleet/bin/canary.sh`)

Plain `curl`, no LLM. Each run fetches on `$CA_URL`:

| Check                | Path                  | Accepted            | Budget |
| -------------------- | --------------------- | ------------------- | ------ |
| `home`               | `/`                   | 2xx                 | 5 s    |
| `search`             | `/search`             | 2xx                 | 5 s    |
| `user`               | `/user/<user>`        | 2xx                 | 5 s    |
| `user_directory_api` | `/api/user-directory` | 2xx or 401 (guest)  | 3 s    |
| `sign_in`            | `/login`              | 2xx                 | 5 s    |
| `upload`             | `/profile`            | 2xx or 307 to login | 5 s    |

Requests carry browser-like headers and the middleware's hourly `__cc`
challenge cookie, so `src/middleware.ts` serves the page instead of the JS
challenge. Vercel's own bot protection sits in front of the middleware and
can still answer with `x-vercel-mitigated: challenge`; such a check is
recorded as `inconclusive` (not a failure, no signal). Set
`VERCEL_PROTECTION_BYPASS` to the project's protection-bypass secret to get
through it; the same secret already protects previews.

The run compares each check with the previous run's `result.json` in the runs
directory. A check that fails now and did not fail before is a **new
failure**; one that passes again is a **recovery**. New failures are posted
as one request to `POST $CA_URL/api/signals/canary` with
`Authorization: Bearer $SIGNALS_WEBHOOK_SECRET`, in the generic body shape
above (`key: canary:<check>`, `severity: critical`, `route`, `link`,
`details.status/time_s/budget_s/run/deployment`); recoveries are posted as
`state: resolved` on the same key so the inbox comments on the open issue.

Rollback happens only when all of these hold: `FLEET_ROLLBACK=true`, a new
failure, `VERCEL_TOKEN` set, and the current production deployment (from
`api.vercel.com/v6/deployments?target=production`) is newer than the one the
last green run recorded. Then
`npx vercel@65 rollback <previous deployment> --scope theexgenesis-projects --token "$VERCEL_TOKEN" --yes`
restores the previous production deployment (the last green run's deployment
when it is still listed, otherwise the newest other READY one), and a second
signal (`key: canary:rollback:<deployment>`) says what was rolled back and
which commit the fixer should treat as the bug.

### Environment

| Variable                                                                                        | Fixer | Canary | Notes                                                                           |
| ----------------------------------------------------------------------------------------------- | ----- | ------ | ------------------------------------------------------------------------------- |
| `FLEET_MODE`                                                                                    | ✓     |        | `pr` (default) or `main`.                                                       |
| `FLEET_ROLLBACK`                                                                                |       | ✓      | `false` (default) or `true`.                                                    |
| `RUN_DIR`                                                                                       | ✓     | ✓      | Default `./.fleet-runs/<UTC ts>-<name>/`. On `ca-fleet` the wrapper exports it. |
| `GH_TOKEN`                                                                                      | ✓     |        | The per-run `FLEET_GITHUB_TOKEN` (contents + issues write, one repo).           |
| `SIGNALS_WEBHOOK_SECRET`                                                                        |       | ✓      | Same secret the inbox route checks. Unset: signals written, not sent.           |
| `VERCEL_TOKEN`                                                                                  |       | ✓      | Deployment listing and rollback.                                                |
| `VERCEL_PROTECTION_BYPASS`                                                                      |       | ✓      | Optional; see above.                                                            |
| `CA_URL`                                                                                        |       | ✓      | Default `https://www.community-archive.org`.                                    |
| `FLEET_MAX_TURNS`, `FLEET_CLAUDE_MODEL`, `FLEET_GIT_NAME/EMAIL`, `FLEET_REPO`, `FLEET_LOCK_DIR` | ✓     |        | Tuning; see `fleet/README.md`.                                                  |

Claude Code on the host authenticates with the dedicated Max login or
`ANTHROPIC_API_KEY`; the harness passes nothing about auth.

### Labels

`fleet:in-progress`, `fleet:pr-open`, `fleet:wontfix`,
`fleet:needs-decision`, created by the fixer with `gh label create` when
missing (plus `bug` if it ever disappears). To hand an issue back to the
fixer, remove the `fleet:*` label; to keep it away from the fixer, leave one
on.

### The run directory

Every run writes `result.json` with `{outcome, issue, pr_or_commit,
session_id, duration_s}` plus routine-specific fields, and keeps the picked
issue, the exact `claude -p` invocations and their JSON output, every gate
log, the staged patch, the signal bodies and responses, the rollback command
(token redacted) and `log.txt`. `fleet/README.md` lists the files and the
outcome values. Runs under `./.fleet-runs/` are gitignored; on `ca-fleet`
the wrapper puts them under `~/services/ca-fleet/runs/` and rotates them
after seven days.

### Flipping the flags

Both live in the host env file `/home/fleet/services/ca-fleet/env`
(control-panel runbook `docs/ca-fleet-operations.md`), not in this repo.

- `FLEET_MODE=pr` → `main`: the memo's rule is ten fleet PRs in a row that
  needed no change. Flip the line, and the next fixer run pushes to `main`
  and closes issues itself. Flip it back the same way; in-flight PRs are
  unaffected.
- `FLEET_ROLLBACK=false` → `true`: needs `VERCEL_TOKEN` in the env file with
  deployment write access. Before flipping, check a few green canary
  `result.json` files show a `deployment` object, since the rollback compares
  against the last green run.

### Cadence on `ca-fleet`

User timers call `bin/fleet-run <name>`, which sources the env file, exports
`RUN_DIR`, and executes `fleet/bin/<name>.sh` from the repo checkout at
`/home/fleet/services/ca-fleet/repo`:

| Routine | Timer            | Lock                                                    | Limits                     |
| ------- | ---------------- | ------------------------------------------------------- | -------------------------- |
| fixer   | every 10 minutes | the unit does not overlap itself; the script also locks | `MemoryMax=4G`, 90 minutes |
| canary  | every 15 minutes | none needed                                             | 12 minutes                 |
| digest  | daily 07:00 UTC  | none needed                                             | 10 minutes                 |

Ten minutes is the pause between issues, not a deadline: a fixer run that is
still working holds the lock and the next tick exits with `outcome: locked`.
Units ship disabled and the flags ship as `pr` / `false`; enabling the
timers is a host operation.

### Watching the fleet

Three things make the fleet legible without reading run directories, all
written by the harnesses themselves (`fleet/lib/common.sh`):

- **Its own failures are signals.** A run that ends in `outcome: error` posts
  `[signal:generic] Fleet <routine> failed: <kind>` to `/api/signals/generic`
  (`key: fleet:<routine>:<kind>`, `severity: warning`), so a fixer that cannot
  authenticate or a read-back that fails shows up in the same inbox as a
  production 502. Handled outcomes (empty inbox, `wontfix`, `needs-decision`,
  a canary that found production broken) are not fleet failures.
- **Per-run metrics.** Every run rewrites
  `/home/fleet/services/ca-fleet/runs/metrics.prom` (Prometheus textfile):
  `fleet_run_total{routine,outcome}`, `fleet_run_duration_seconds`,
  `fleet_last_success_timestamp`, `fleet_tokens_total{kind}` and
  `fleet_cost_usd_total` from `claude -p`'s usage fields,
  `fleet_signal_to_fix_seconds` (issue created → PR opened or commit pushed),
  per-check canary state, and "what waits on a human" gauges. Alloy on
  `ca-fleet` ships them to Grafana Cloud, where the **Fleet** dashboard
  (control-panel `ops/monitoring/dashboards/fleet.json`) reads top to bottom:
  what happened today, how fast, how well, how much, what waits on a human.
  Two alerts exist, published paused: fixer failed three runs in a row, canary
  not succeeded in 45 minutes. `fleet/README.md` lists every series.
- **The daily digest.** `fleet/bin/digest.sh` (timer `fleet-digest`, 07:00
  UTC, shipped disabled) opens one issue `[fleet:digest] <date>` with the
  `fleet:digest` label: signals received and their state, fixer runs with
  PR/commit/learning links, fleet PRs merged or closed and reverts on `main`,
  canary status, the day's cost, the fleet's own failures, and what needs
  Christine. It closes the previous day's digest. No LLM;
  `FLEET_DRY_RUN=true` prints instead of posting.

Operator view, in reading order: dashboard → digest → inbox → run directory
(control-panel `docs/ca-fleet-operations.md`, "Watching the fleet").

### Tests

`pnpm fleet:test` runs `shellcheck` over `fleet/` and the tests in
`fleet/test/` (issue selection, verdict parsing, read-back checks, the Tier 1
guard, full fixer runs in both modes against a bare git remote with fake
`gh`/`claude`/`pnpm`, canary runs with a fake `curl`/`npx` including the
rollback path, the metrics textfile and failure signals, and the digest in
dry-run and posting mode). CI runs it in the pull-request workflow after the
unit tests.
