# Community Bulletin

Signed-in members use `/bulletin`; the existing admin allowlist controls
`/admin/bulletin`. The worker runs after the daily autorefresh succeeds.

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
Server routes verify the session before fetching private state. Opt-outs during
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
4. Reuse unchanged positive/negative decisions; send remaining candidates to
   `z-ai/glm-5.3-flash` through OpenRouter with the run's pinned prompt.
5. Validate the result and exact evidence substring, recheck policy and source,
   then save a positive or negative decision.

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

Admins append prompt versions with a change note; history is immutable and
stale concurrent edits fail. Each run pins one version at startup. Mid-run edits
affect later runs only. Changing a prompt does not reclassify cached decisions.
The dashboard displays each run's actual pinned prompt. Older runs without that
metadata say so rather than inventing attribution.

Normal admission limits are $0.10/day and $1/calendar month, UTC, with 10%
headroom. Calls reserve a conservative maximum first; ambiguous or timed-out
calls retain that reservation. Retries wait an hour and stop after three
attempts per unchanged input. Model routing forbids fallback or price escalation
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

Owner: Community Archive backend. Existing worker host: `ca-autorefresh`
(`95.217.12.23`), unit `ca-bulletin.service`, invoked after autorefresh succeeds.
The wrapper never reruns scraping to retry Bulletin. Service failure invokes the
existing journal failure unit. Inspect unit status, last-success age, queue and
run dashboard; investigate non-complete status or freshness older than 36 hours.

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
  python -m unittest -v test_worker.py test_clickhouse_worker.py
```

These tests require a named disposable local database. They exercise a fake
ClickHouse source against real PostgreSQL policy/job state, including a tweet
that does not exist in PostgreSQL, replay, edits, failure recovery, opt-out,
private grants, budgets and prompt pinning. Gateway and website tests cover the
corresponding read and ranking contracts. No production corpus reset is needed.
