# Community Bulletin

Signed-in users with an active streaming opt-in use `/bulletin`; the existing
admin allowlist controls `/admin/bulletin`. The worker runs after the daily
autorefresh succeeds.

## Data and privacy

**All Bulletin tweet reads use ClickHouse**, through two authenticated gateway
routes: `bulletin-tweets` (bounded scan) and `bulletin-sources` (current source and
public reply/quote evidence). Expanding a notice uses the existing ClickHouse
tweet-detail adapter and canonical TweetCard, including media and quoted tweets.
Bulletin archive-permalink links also require ClickHouse, even when the general
website read flag is disabled. There is no Bulletin PostgreSQL tweet fallback.

Supabase holds private decisions, opportunities, cost reservations, scan cursors,
run history and immutable prompt versions. It remains authoritative for auth,
membership, consent and scrape blocks. The gateway requires a fresh membership
projection; the worker and board additionally check current Supabase policy.
The decisions table no longer requires a matching PostgreSQL tweet row.
Only derived notices and source hashes are stored, not a second tweet corpus.

Browser roles cannot access the `bulletin` schema or its service-only RPCs.
The board and tweet API routes verify the session and current PostgreSQL
`optin` record before fetching private state: `opted_in` must be true and
`explicit_optout` must not be true. Archive membership alone does not grant
viewer access. Signed-out visitors go to login; other visitors without consent
go to the opt-in page with a return link after opting in. Consent lookup failures
deny access. The existing loopback-only local admin preview remains available.
Opt-outs during
a model call suppress publication. Every board read verifies current ClickHouse
content, author, original-post status and hash. Missing, edited or deleted sources
are hidden. Derived records may remain privately stored until reconciliation;
physical source deletion no longer cascades across databases. Costs contain no
tweet identifiers and remain available for budget accounting.

`BULLETIN_FOLLOW_SOURCE=supabase` enables the original app's recommendation method
using archived follower/following lists. Enable it for the initial release. Both directions of each relationship are combined,
restricted to currently allowed members. These are historical observations, not
live X follow state. Without that source the UI explicitly falls back to own
notices and newest, and does not invent social recommendations.

## Method and coverage

1. Page all distinct ClickHouse tweet IDs in the run's posting-date window.
2. Re-read their latest content and keep eligible originals: permitted community
   authors, live posts, no replies, no reposts.
3. Apply the pinned upstream phrase patterns and cleaning gate (minimum 25
   cleaned characters). Those matches are the candidates.
4. Reuse unchanged positive/negative decisions. Prepare remaining candidates
   with the maintained `tweet-plaintext` renderer: seed, nearby replies, and
   directly quoted tweets. Send them to `z-ai/glm-5.3-flash` through OpenRouter
   with the run's pinned prompt and the worker's versioned context instructions.
5. Validate the result and exact evidence substring, recheck policy and source,
   then save a positive or negative decision.

### Automated plaintext context

`tweet_context.py` calls the same helpers as the operator `tweet-plaintext`
skill. The exact source files are bundled under `vendor/tweet_plaintext/` with
a pinned commit and checksums, so worker releases do not depend on a laptop's
skill installation. There are no extra runtime packages or image-model calls.

The existing gateway thread endpoint fetches at most 500 conversation tweets.
The renderer selects a reply-edge radius of two plus one outgoing quote hop,
then limits input to 21 tweets and a soft 12,000-character target. It prioritizes
the seed and the author's newest replies, keeps the seed whole, and explicitly marks
omissions. The existing 64 KiB request ceiling and byte-based cost reservation
still apply to the complete model request, including context.

Cached conversation records are checked against fresh `bulletin-sources` text
and current PostgreSQL `bulletin.allowed_accounts` before rendering. Changed,
deleted, reposted, or disallowed context is omitted. A missing/stale cached seed
uses current seed-only text with an explicit limitation. A thread 404 is marked
unavailable; other gateway failures stop the run before model spending. Context
preparation failures emit a `context_preparation` error stage.

The model classifies the seed, not another participant's offer. The joke
exclusion remains, and neither a question nor a vague post qualifies on its own.
Author replies or an explicitly shared quote may clarify a real ask/offer, but
missing replies, links, and undescribed images are not assumed to contain details.
Summaries and extracted fields stay grounded in the seed; exact evidence must
still occur in its text. Context text is never written to the bulletin database
or logs. Every printed source's hash and current consent are checked again before
saving; a change leaves the decision pending without repeating the paid call
immediately or removing its cost from the ledger.

The graph endpoint may cache reply discovery for an hour. The classifier version
bump reconsiders encountered candidates in newly scanned windows; it does not
trigger a historical backfill. Candidate phrase filters are unchanged.

### Resolution and reopening

Positive labels include `availability` with `state` (`unknown`, `open`, or
`resolved`), `tweet_id`, and exact `evidence`. Unknown has null evidence fields.
An explicit author statement can resolve or reopen a notice. Evidence must occur
in the seed or a printed descendant reply by the same author; unrelated posts,
quotes, other participants' interest, generic thanks, silence, and partial uptake
do not establish closure. The model uses the latest applicable author statement.
A resolved notice remains a positive notice, preserving it for later viewing.

The database stores only the availability state and evidence tweet ID/hash, plus
the checked context digest/time. It does not store reply text. Before displaying
resolved status (or hiding the card by default), the board verifies the evidence's
current author and content hash. Missing or changed evidence makes the status
unknown in that response. Confirmed resolved notices are hidden by default;
`Show resolved` includes them independently of `Show past`, with a badge linking
to the author update. An explicit reopening restores default visibility.

Each regular daily run checks **all active saved notices** not yet checked that
UTC day, oldest check first. Active follows the board's lifetime: 14 days for
undated asks, 60 for offers, explicit dates, standing notices, and self-quote
renewals. This includes resolved notices still within that lifetime so they can reopen.
Unchanged rendered context updates the check time without a model call. Changed
context joins the existing durable queue; existing call, day/month budget, retry,
and run-time limits still apply. Fresh candidates precede newly queued rechecks.
There is no per-run item cap. If the run-time limit prevents finishing context
checks, the run reports a failure and keeps completed checkpoints for resumption.
Model-call and spending limits can still defer changed-context classifications.
Backfills and explicit refresh jobs do not start unrelated availability checks.

New intake and rechecks use the same classifier/output validator. Failed or
ambiguous rechecks do not silently mark a notice resolved, and unknown does not
erase an earlier confirmed resolution. Older evidence cannot override a newer
author update. A failed recheck preserves its prior card
and cost history. Context changes during a model call retain the normal pending
retry behavior rather than publishing stale results.

Deployment requires the complete `services/bulletin` directory, including the
vendored helpers. The existing gateway endpoints suffice. Apply
`20260911222035_bulletin_resolution_status.sql` before deploying this worker;
it adds private opportunity metadata and a recheck index. The public RPC remains
JSON, so its generated TypeScript signature is unchanged. Old frontend/worker
releases tolerate the added columns; rollback the worker and frontend separately
while retaining the resolution metadata and cost ledger.
Before production rollout, inspect a small, separately budgeted model pilot for
real asks, jokes, vague posts, and clarifying replies. Worker deployment and any
historical reclassification remain separate from merging the web access gate.

Daily runs scan the previous **two complete UTC days**. Each day gets a distinct
scan key, so the overlap catches late arrivals without rebilling unchanged text.
Posts arriving more than two days late need an explicit replay. Backfills have
separate fixed windows and durable cursors; they do not advance the daily cursor.
Use `--rescan` to revisit an already completed window after late arrivals or edits;
its cached decisions and cumulative cost cap remain intact. A page's decision
writes and cursor advance commit together. Empty returned
member content does not end a scan: the source-ID cursor advances across holes.
A zero source-ID page marks intake complete. A successful run also requires no
unresolved decisions in the queue. An intake-complete cursor alone does not mean
classification completed.

A run reads at most 100 pages of 500 IDs, makes at most 50 model calls, and has a
15-minute soft / 20-minute systemd limit. Partial scans resume with the same
window. Run counts show scanned source IDs, eligible originals, phrase matches,
model calls, positives, negatives and unresolved work. Counts across overlapping
runs are not unique totals. Old PostgreSQL runs remain labeled as legacy.

Coverage is **the available ClickHouse projection**, not all tweets published on
X. Missing ingestion, late arrivals, replies/reposts, phrase-filter misses and
model mistakes limit recall. We have not measured how many genuine opportunities
the filters miss; that would require a separately scoped random-sample audit.

## Board behavior

The board has offer/ask columns, category counts, search, recommended/newest
sorting, past notices and expandable originals. Category, sort and past filters
are preserved in the URL hash; the optional recommendation handle is a query
parameter. The verified signed-in account is the default viewer.

Recommended order: own notices, mutuals, one-way follows, everyone else; newest
within each group. Active notices precede past notices. Undated asks expire after
14 days and offers after 60 days; standing notices do not expire. An explicit
expiry date is inclusive in UTC. An archived self-quote renews the default
undated lifetime, but does not override an explicit expiry date.

Cards link to X for responding and to a prefilled GitHub issue for corrections.
Neither link sends anything automatically. Counts cover distinct archived member
repliers and quote posts, not DMs, successful outcomes or all X engagement.
Personal activity covers only the notices loaded on this board. At most the
latest 2,000 saved notices are loaded; the UI states when that cap is reached.

## Prompts and budgets

The admin dashboard includes a read-only candidate-filter summary and exact
patterns/code generated from this worker. After changing `candidates`,
`clean_text`, `side_of`, or the phrase patterns, run
`python3 services/bulletin/export_filters.py` from the repository root.
`python3 services/bulletin/export_filters.py --check` verifies the snapshot.
The website shows its packaged source snapshot; worker rollout is independent.

Admins append prompt versions with a change note; history is immutable and
stale concurrent edits fail. Each run pins one version at startup. Mid-run edits
affect later runs only. Changing a prompt does not reclassify cached decisions.
The dashboard displays each run's actual pinned prompt. Older runs without that
metadata say so rather than inventing attribution.

Normal admission limits are $0.10/day and $1/calendar month, UTC, with 10%
headroom. Calls reserve a conservative maximum first; ambiguous or timed-out
calls retain that reservation. Transient model-request failures (HTTP 408, 429,
5xx, network errors and timeouts) retry within the same run after 2 then 5 seconds,
plus up to one second of jitter. Respect a provider's `Retry-After` up to 60 seconds;
longer waits are deferred to a later run. Authentication, payment, validation and
publication errors do not trigger immediate model retries. Retries stop after
three total attempts per unchanged input, including attempts from earlier runs.
Every retry rechecks current source/policy and reserves budget again; it counts
toward the run's 50-call cap and must fit within the remaining time allowance.
Successful recovery makes the run `ok`; `failed` still counts failed attempts.
Unresolved work from an earlier run remains eligible after an hour, when the
next run starts; there is no standalone retry timer.
Model routing forbids fallback or price escalation
and caps prices at $0.15 input / $0.50 output per million tokens.

An explicitly approved backfill can use `--backfill-budget-usd` (at most $1).
Its cap is cumulative across runs of the exact same window. The monthly cap
still applies. Approved backfill calls are separate from normal daily admission;
never clear the cost ledger to reset spending. Approved backfills retry after
one minute, with the same three-attempt limit; normal runs wait one hour.

```sh
# Scan only; no model calls. Repeat to resume a bounded partial scan.
uv run worker.py --start 2026-08-26 --end 2026-09-09 --enqueue-only
# After approval of the one-time cap; repeat until complete, respecting retries.
uv run worker.py --start 2026-08-26 --end 2026-09-09 --backfill-budget-usd 1
```

## Runtime and rollout

### Admin refresh controls

Admins can open **Refresh notices** in the bulletin header, or use the controls
under the prompt editor. Save a draft first, then choose the latest run's exact
window or the previous 14 complete UTC days and a per-request cap ($0.01–$1,
default $0.10). This reclassifies all phrase-filter candidates, including cached
positive/negative decisions, with the saved prompt version pinned at submission.
It does not rerun scraping or bypass the upstream phrase filters.

The server checks the existing admin identity gate and rejects local read-preview
writes. The service-only RPC records an idempotent request and allows only one
active refresh. `ca-bulletin-refresh.timer` checks the queue once per minute;
`worker.py --queued-only` processes one bounded batch under the same advisory lock
as the daily worker. An empty queue makes no model calls. Intake and call/time
limits automatically continue on the next tick, using the same cursor, pinned
prompt, attempts and cumulative spending cap. The existing monthly cap and
conservative reservations also apply. Budget exhaustion or model errors stop the
request visibly; there is no automatic budget increase or retry-counter reset.
Only a new, explicitly submitted refresh resets attempts once for its candidates.
Daily classification does not consume refresh-owned pending decisions.

Unchanged existing notices remain visible while reclassification is pending or
fails. A successful positive replaces the notice; a successful negative removes
it. Current source-hash and consent checks still suppress stale/private sources.
The UI polls status and shows the latest batch plus cumulative spending; reload
the board to see newly classified results. Stopped requests can be investigated
in run history before explicitly requesting another refresh.

Production activation is separate from shipping this code:

1. Apply `20260911014857_bulletin_refresh_requests.sql` and verify service-role
   RPC access and denial for browser roles. This migration is required by the
   updated daily worker as well as the refresh worker.
2. While the daily unit is idle, install the tested worker release and the new
   refresh service/timer beside the existing unit, retaining the same runtime
   credentials and previous release. Enable the timer. An empty-queue smoke
   requires no model calls. Verify timer health before exposing the controls.
3. Set server-only `BULLETIN_REFRESH_ENABLED=true` for the intended website
   environment. Leave it unset on previews unless their worker/DB queue is
   separately configured. Local admin preview always remains read-only.
4. Any production classification smoke needs its own approved window/cap.

To disable new requests, remove `BULLETIN_REFRESH_ENABLED`. Stop the refresh
timer/service before rolling back the worker. Keep schema, requests, prompts,
derived data and cost history. An older daily worker does not understand refresh
ownership; do not resume it with pending refresh-owned decisions until those
requests have been reconciled. Never clear billing history to make a rerun fit.

Owner: Community Archive backend. Existing worker host: `ca-autorefresh`
(`95.217.12.23`), unit `ca-bulletin.service`, invoked after autorefresh succeeds.
The wrapper never reruns scraping to retry Bulletin. Service failure invokes the
existing journal failure unit. Inspect unit status, last-success age, queue and
run dashboard; investigate non-complete status or freshness older than 36 hours.

Failures emit a JSON `bulletin_error` event to the systemd journal with run/call
IDs, attempt, processing stage, exception class, HTTP status when available, and
the scheduled retry delay. The private call ledger also retains HTTP status in
`failed:HTTPError:<status>`. These diagnostics intentionally omit exception
messages, request URLs, provider bodies, tweet content, credentials and headers.
Inspect them with `journalctl -u ca-bulletin.service --since today -o cat`.
Grafana Alloy can forward this unit's journal to Loki; worker installation alone
does not configure log shipping or external alerts. Alert on the final failed
run or stale last success, rather than every recovered attempt.

The immutable release lives beneath `/opt/community-archive-bulletin/releases/`
with a `current` symlink. PostgreSQL policy/state settings are read at runtime
from `/root/CA_autorefresh/.env.prod`; the OpenRouter key remains in the existing
systemd credential `openrouter_api_key`. Add server-only
`CLICKHOUSE_ANALYTICS_API_URL` and `CLICKHOUSE_ANALYTICS_API_TOKEN` to the website configuration. The worker reads its gateway token from the
existing systemd credential mechanism (`ca-bulletin-clickhouse`) and sets the
public gateway URL in its unit. Do not reuse the retired port-18123 sink URL.
Never put these values in browser variables, source files, argv or logs.

Rollout dependencies, in order:

1. Verify the ClickHouse projection/ingestion gates and deploy the gateway PR,
   reconciling its base with the actual live gateway SHA. Smoke authenticated
   routes and unauthenticated rejection. Retain the previous complete release.
2. Apply the run-history, prompt-version and ClickHouse Bulletin migrations.
   Recheck private grants and migration ledger. This is a manual production gate.
3. Install the worker and its gateway configuration while the unit is idle.
   Preserve the previous symlink. Run a bounded scan/classification smoke.
4. Complete the approved two-week backfill and verify zero unresolved work for
   the window. Enable the approved follow-data source.
5. Verify the logged-in board, admin counters and prompt saves, then merge/deploy
   the dependent website. An open draft PR does not authorize these steps.

Old workers remain compatible with the additive columns and removed FK, but do
not hydrate the new metadata. New website code requires the new RPCs and gateway.
Rollback the website and worker independently; keep schema, prompts and cost
history. Restore the prior gateway bundle only after its new callers are stopped.

## Local preview and focused checks

Loopback-only `LOCAL_ADMIN_PREVIEW` permits read previews, never prompt writes.
Optional `BULLETIN_LOCAL_RUN_PREVIEW_URL` and `BULLETIN_LOCAL_BOARD_PREVIEW_URL`
accept only `http://127.0.0.1` bridges to private state. They are disabled outside
that explicit local preview guard. Tweet reads still use ClickHouse.

```sh
BULLETIN_TEST_DSN='host=127.0.0.1 port=55439 dbname=bulletin_test user=frsc' \
  uv run --with 'psycopg[binary]==3.2.9' --with duckdb==1.5.5 \
  python -m unittest -v test_worker.py test_retries.py test_tweet_context.py test_resolution.py test_clickhouse_worker.py
```

These tests require a named disposable local database. They exercise a fake
ClickHouse source against real PostgreSQL policy/job state, including a tweet
that does not exist in PostgreSQL, replay, edits, failure recovery, opt-out,
private grants, budgets and prompt pinning. Gateway and website tests cover the
corresponding read and ranking contracts. No production corpus reset is needed.
