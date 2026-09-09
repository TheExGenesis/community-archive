# Private Bulletin opportunities

One daily worker runs **after the existing autorefresh pipeline succeeds**.
It uses the measured Bulletin phrase filter, then asks OpenRouter's
`z-ai/glm-5.3-flash` to classify each new candidate. The website serves `/opportunities` to verified signed-in users and
`/admin/opportunities` to the existing admin allowlist.

## Storage and website access

- `bulletin.opportunities`: confirmed asks/offers, category, summary, exact
  evidence, topics, response method, location, expiry and model.
- `bulletin.decisions`: pending work plus positive/negative results, keyed by
  tweet ID, source-text hash and classifier version. Unchanged text is not billed again.
- `bulletin.calls`: durable cost reservations and reported costs. It retains
  no tweet IDs, authored text or account data.
- `bulletin.worker_state`: intake cursor, last run, result counts and health.
- `bulletin.runs`: durable per-run aggregate counts, timestamps, status and model.
  Calls link to runs for reported cost and unpriced reservations. No tweet or
  author identifiers are stored in run history.

The `bulletin` schema is not exposed through the Data API. Browser roles have
no schema/table privileges and all five tables have RLS enabled. The website's
**server-side service-role client** can call:

```ts
const { data, error } = await serviceRoleClient.rpc(
  'get_bulletin_opportunities', { max_results: 50 }
)
```

The page authorizes with the existing server-verified `getCurrentUser()` before
calling the RPC, and does not accept member-preview cookies as authorization.
The board shows up to the latest 200 currently active notices, with filters over
that displayed set. It links to the existing full tweet detail renderer rather
than duplicating its media and quote logic. Reads are dynamic, private/no-store
and noindex. Only summary fields and exact evidence reach the client board.

The admin page calls `get_bulletin_runs(before_id,max_results)` only after the
existing `getAdminClient()` gate. Run history uses numeric-ID keyset pagination,
25 runs per page. Each run records rows scanned, phrase candidates, AI calls,
positive and negative decisions, failures, suppression and ending queue size.
Scan overlap means counts are not unique tweets over multiple days. Candidates
include cached matches; AI calls can include older queued work and retries.
Positive counts are saved decisions, not today's visible board size.

History starts with the updated worker; earlier runs are not reconstructed.
Progress persists after each scan page and each model call. Stopped workers keep
partial counts: the UI flags a running row older than 25 minutes, and the next
worker holding the shared lock marks the prior row interrupted. Interrupted runs
have no invented finish timestamp. The dashboard exposes costs and read-only
refresh, not controls that initiate paid calls.

Never call this using a browser service key or expose the table directly.
This RPC rechecks current membership, explicit opt-outs, scrape blocks,
tombstones, source text, reply/retweet status and expiry before returning data.
Original tweet text comes from `public.tweets`; the worker does not keep a second
copy. Physical source deletion cascades to decisions and opportunities. A daily
cleanup removes derived data for tombstones and accounts no longer eligible.
Undated, non-standing notices age out of reads after 30 days; explicit end dates
are inclusive in UTC. The table retains expired records for private inspection.

## Intake and limits

The first run starts with the previous 24 hours of `tweets.updated_at`. Later
runs use a saved `(updated_at, tweet_id)` cursor over a bounded recent-tweet set, so
changes from all PostgreSQL ingestion sources can be seen after autorefresh.
Only tweets posted within the two days before each scan boundary can become new
candidates; the existing created-at index bounds the read. This avoids historical
engagement updates and is not a backfill. Tweets arriving later than two days,
and gaps after prolonged outages, need a separately scoped replay. A one-hour overlap covers ordinary late commits. Transactions
that commit more than an hour after their update timestamp need a separately
scoped replay. ClickHouse-only records are outside this initial worker's scope.

Each run scans at most 100,000 updated rows, in pages of 1,000, with a 30-second
statement timeout. Partial intake saves its cursor and resumes next run.
The worker requires current PostgreSQL membership and consent; no snapshot from
the earlier local experiment is used. The exact pinned upstream DuckDB RE2
patterns and Python cleaning gate live in `upstream_filter.py`.

One advisory lock prevents overlapping workers. Classification has at most 50
calls and a 15-minute soft runtime limit (20-minute systemd limit), 60 seconds
per request, and 2,048 output tokens including reasoning. It sends original text
and treats tweet content as data. Positive output must contain an exact source
substring and pass type/category/date checks before publication.

Application budgets are **$0.10/day and $1/calendar month**, UTC, with 10% headroom.
Admission reserves an upper estimate before every call, then uses OpenRouter's
reported cost where available. Ambiguous/time-out requests keep their reservation.
OpenRouter routing is restricted to this model, no provider fallback, and maximum
prices of $0.15 input / $0.50 output per million tokens. No automatic price/model
escalation. Retries wait at least an hour, stop after three attempts per unchanged
input, and share the same budget. Exhausted/failed work remains visible in the queue.
Do not clear the call ledger to reset spending. These are application limits,
not an OpenRouter account-level hard cap.

## Deployment and credential handling

Owner: Community Archive backend; host: `ca-autorefresh` (`95.217.12.23`).
Source: `services/bulletin/` in the Community Archive repository.
Install immutable release files under `/opt/community-archive-bulletin/releases/`
and point `/opt/community-archive-bulletin/current` at the chosen release.

`ca-bulletin.service` is a oneshot with one CPU, 512 MiB memory, a private temp
directory and restricted file permissions. PostgreSQL settings are read at
runtime from `/root/CA_autorefresh/.env.prod`. The OpenRouter key is supplied by
systemd's `LoadCredentialEncrypted`, named `openrouter_api_key`, from
`/etc/credstore.encrypted/ca-bulletin-openrouter`. Keep plaintext out of argv,
logs and persisted files; provision the encrypted secret only with authorization.

The daily cron keeps its existing 03:00 UTC schedule, working directory and
pipeline lock. Only its command changes to:

```sh
python3 /opt/community-archive-bulletin/current/after_autorefresh.py \
  --pipeline-root /opt/community-archive-canonical-autorefresh/releases/69deae9ad3c880d9e7823bcca42c664c1b219c0c
```

The wrapper runs the same `uv run --env-file .env.prod run_pipeline.py` first;
only exit code zero starts Bulletin. It never reruns the scraper to retry a
failed Bulletin job. For a manual Bulletin-only retry, use
`systemctl start ca-bulletin.service`.

## Health, alerts, and rollback

Check `systemctl status ca-bulletin.service` and `journalctl -u ca-bulletin.service`.
Failure invokes `ca-bulletin-failure.service`, which writes a `daemon.err` journal
alert. There is no external email/Slack notification configured by this change.
The worker logs aggregate counts and error types only. Inspect its private state:

```sql
SELECT status,last_started_at,last_finished_at,last_success_at,counts
FROM bulletin.worker_state;
SELECT status,count(*) FROM bulletin.decisions GROUP BY status;
SELECT count(*) FROM public.get_bulletin_opportunities(200);
```

Investigate any non-`ok` result, failed systemd unit, or successful timestamp
older than 36 hours. Check autorefresh first if no run started; an unsuccessful
upstream run intentionally does not launch Bulletin. For failed decisions, inspect
call status without copying provider responses or tweet text into logs.

To roll back scheduling, restore only the original autorefresh cron command
from the deployment backup; preserve other cron entries. Stop the Bulletin unit
if active. Autorefresh and the website continue operating. Leave the private
tables and spend ledger intact. The opportunities and admin pages depend on the corresponding read RPCs.

## Focused verification

`test_worker.py` uses a disposable PostgreSQL database with only the necessary
fixtures. Never point `BULLETIN_TEST_DSN` at a real project:

```sh
BULLETIN_TEST_DSN='host=127.0.0.1 port=55439 dbname=bulletin_test user=frsc' \
  uv run --with 'psycopg[binary]==3.2.9' --with duckdb==1.5.5 \
  python -m unittest -v test_worker.py
```

It checks reruns and negative caching, edits, browser-role denial, backend reads,
expiry, deletion cascades, opt-outs during calls, timeouts, spending admission,
invalid evidence, overlapping workers, and ordering after autorefresh success.
Local validation uses PostgreSQL 14; production PostgreSQL 15 gets a bounded
post-migration privilege/read check. The full Supabase reset/diff path requires
Docker and is not part of this focused check.

The security advisor reports informational “RLS enabled, no policy” notices
for these five tables. This is intentional: browser grants are revoked and only
the backend bypass-RLS role may access them. No public row policies are needed.

## Website/run-history rollout

The original private-table migration and worker are already live. This follow-up
requires the new `bulletin_run_history` migration and an updated worker release.
Apply the reviewed migration before switching the worker or merging the website.
It adds only the private runs table, nullable `calls.run_id`, its index and the
service-only run-history RPC. Old workers remain compatible.

Deploy the committed worker as an immutable release and change `current` only
while `ca-bulletin.service` is idle; retain the previous symlink target. The cron
and encrypted credentials stay as configured. A Bulletin-only smoke run is
bounded by the existing budgets and does not restart autorefresh. Confirm the
new run row, its counters/costs and private RPC before merging the frontend.
Rollback: restore the preceding worker symlink and revert the website commit;
leave the additive schema and cost history intact.
