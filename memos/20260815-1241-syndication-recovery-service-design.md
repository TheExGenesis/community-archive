# Syndication conversation recovery service

Status: proposed boundary; direct ingestion-writer Syndication traversal removed
from the current draft branches. No service has been deployed.

## Conclusion

Centralize persistent Syndication recovery in one bounded worker. Ingestion
writers should persist the best source metadata they already possess and
transactionally leave incomplete replies in the PostgreSQL recovery queue. They
should not call the recovery HTTP service or the public Syndication endpoint in
their ingest transactions.

Use PostgreSQL, not the Firehose Redis instance, as the durable queue authority.
All normal ingestion paths already commit tweets to PostgreSQL, and the
conversation-resolution schema in Community Archive already has most of the
needed queue state. A database trigger can enqueue in the same transaction as
the tweet write, avoiding the failure window between a successful ingest and a
separate HTTP or Redis enqueue.

The first service version should complete threads that contain at least one
known local tweet. Arbitrary tweet acquisition is a related but broader crawler
capability and should be a later, explicitly budgeted mode rather than an
accidental property of the completion endpoint.

## Current state

- Community Archive draft PR #713 adds authoritative conversation provenance,
  a `pending` conversation state, retry metadata, a pending index, and an
  insert trigger that observes every PostgreSQL tweet writer.
- Firehose draft PR #9 and Autorefresh draft PR #5 preserve authoritative
  source conversation IDs when supplied.
- The three drafts no longer contain ingestion-time Syndication traversal.
- The web application retains its pre-existing render-only Syndication fallback;
  that client must not persist fetched tweet content.
- The current database resolver can cheaply inherit a root through tweet rows
  already present locally. Its production scheduling must not race a future
  external worker over the same unleased pending rows.

## Recommended data flow

1. A writer inserts or updates a tweet, including source `conversation_id`,
   `reply_to_tweet_id`, and `reply_to_user_id` when present.
2. An authoritative source conversation ID wins immediately. A root with no
   reply pointer resolves to itself.
3. Otherwise the same PostgreSQL transaction marks the tweet's conversation
   row `pending`. Writers do not make a second network call.
4. The recovery worker claims a small leased batch using a security-definer
   function and `FOR UPDATE SKIP LOCKED` semantics.
5. The worker follows all available local parent links first. It groups seeds
   that reach the same missing parent so one run does not repeat identical
   Syndication requests.
6. For the first missing parent, or for a seed that looks like a reply but lacks
   a parent tweet ID, the worker queries Syndication outside any database
   transaction.
7. The worker verifies that the returned `id_str` exactly equals the requested
   ID, records no raw response, and walks only explicit parent tweet IDs. It is
   bounded by depth, cycle detection, request count, timeout, and rate limit.
8. Immediately before persistence, each recovered tweet author is checked by
   account ID and username against both authoritative opt-out sources.
9. Eligible normalized rows are written idempotently without overwriting richer
   archive/API records. An opted-out node may be traversed in memory, but its
   content, profile, media, mentions, URLs, and authored relationships are not
   persisted or logged.
10. Resolved descendants receive the root conversation ID and recovery
    provenance. Incomplete walks are retried with backoff or retained as an
    explicit partial result; ordinary ingestion is never blocked.

## Queue contract

For the known-local-tweet MVP, extend `public.conversations` instead of adding a
second queue:

- retain `resolution_status`, `attempt_count`, `next_attempt_at`, and
  `last_error`;
- add `lease_owner`, `lease_expires_at`, and `last_attempted_at`;
- add terminal/observable `partial` and `exhausted` states rather than leaving
  permanent failures indistinguishable from fresh work;
- expose only narrow claim, complete, retry, and release functions to the
  worker role;
- keep producer writes idempotent so later authoritative conversation IDs
  supersede queued or partial state;
- do not hold a database transaction during Syndication requests.

The claim function should return only IDs and relationship metadata needed for
work. Queue and metrics interfaces must never expose tweet text, usernames, or
raw Syndication payloads.

Potential future arbitrary acquisition should use a separate private request
table with an explicit request mode, source, priority, budget, and audit trail.
It should not weaken the known-local-tweet foreign-key and consent boundary.

## Endpoint contract

Run a loopback-only service on `prod-firehose`, the existing queue/ingest host,
owned by the Community Archive repository under
`services/conversation-recovery/`. Recommended endpoints:

- `POST /v1/recovery/enqueue`: authenticated operator/external-producer helper
  for known local tweet IDs; idempotently marks them pending in PostgreSQL.
- `GET /healthz`: process, database, and claim-loop readiness without content.
- `GET /metrics`: Prometheus metrics without tweet IDs, usernames, or content.

Normal archive, Firehose, and Autorefresh writes should use the transactional
database trigger rather than this HTTP endpoint. The endpoint is useful for
manual repair, backfills, and future producers that do not own the tweet write
transaction.

## Syndication stop and retry rules

- `reply_to_tweet_id` is traversable. `reply_to_user_id` alone is not: it only
  signals that the tweet may be an incomplete reply.
- If Syndication omits the parent tweet ID, stop at the highest known ancestor,
  mark the job partial, and retry on a bounded schedule. Never guess a root from
  a user ID.
- A tombstone or empty response means the endpoint did not provide the tweet;
  it is not proof of deletion or protection.
- A returned ID different from the requested ID is a redirect/mismatch and must
  not be inserted as that node. This is especially important for retweets.
- Syndication does not provide `retweet_count`; `conversation_count` is a
  different metric and must not be substituted.
- Suggested backoff is immediate local retry only once, then approximately 5
  minutes, 1 hour, 1 day, and terminal `partial`/`exhausted` after the configured
  attempt budget. Apply jitter and honor upstream rate/timeout signals.

## Service safety limits

- Default concurrency 2 and a configurable low request-per-second ceiling.
- Maximum 64 ancestors and 64 Syndication requests per job.
- Per-run fetch cache and cross-job grouping by the first missing parent.
- Exact-ID validation, cycle detection, response-size limit, schema validation,
  and request timeout.
- Idempotent writes and leases that expire safely after process death.
- No raw payload persistence and no content-bearing logs or metric labels.
- A global kill switch that stops claims without affecting ingestion or queued
  state.

## Grafana and service ownership

The service is not production-complete until its implementation also updates
the control panel's service catalog, owning runbook, bootstrap/deploy path,
Alloy collection, dashboards, and alerts.

Collect:

- service/process up, health endpoint, restart count, and build version;
- ready, leased, retrying, partial, and exhausted jobs;
- oldest ready age, lease age, claim and completion rates;
- Syndication outcomes by bounded class: success, no-parent metadata,
  tombstone/empty, ID mismatch, malformed, timeout, rate-limited, and other;
- recovered/eligible/blocked tweet counts and completed chain depth histogram;
- PostgreSQL write success/failure and last successful recovery timestamp.

Alert on service unavailability, stuck leases, oldest-ready age, sustained
backlog growth, no successful completions while work is ready, and elevated
request/write failure rates. Metrics must remain aggregate-only.

## Rollout and rollback

1. Merge and verify conversation-ID persistence and transactional pending-row
   creation with all external recovery disabled.
2. Add leases and service RPCs. Disable the database cron consumer before the
   external service can claim the same queue, or make the service the sole
   owner of the existing local-resolution function.
3. Deploy the service disabled, register it in the service catalog, and verify
   live Grafana health and queue metrics.
4. Shadow a representative bounded batch: fetch and classify without
   persistent tweet writes. Verify exact-ID, partial, retry, opt-out, and crash
   recovery behavior.
5. Enable writes at concurrency one for fresh jobs, verify PostgreSQL and
   ClickHouse parity, then raise the limit gradually.
6. Start historical recovery only through a separately authorized bounded
   replay.

Rollback is to stop claims or disable the systemd unit. Ingestion continues and
PostgreSQL retains pending jobs for a later compatible release. Never delete the
queue to roll back the worker.

## Design decisions to confirm before implementation

Recommended defaults are: PostgreSQL as the queue, known-local-tweet completion
only in v1, `prod-firehose` placement, loopback endpoint, and one external worker
owning both local-first and Syndication traversal. The main remaining product
decision is whether arbitrary tweet acquisition belongs in the first release;
the recommendation is no.
