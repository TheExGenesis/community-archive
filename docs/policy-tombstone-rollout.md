# Policy tombstone rollout

PostgreSQL remains the consent authority. Active ingestion services must load
that authority once per batch immediately before persistence and send the same
policy-safe input independently to PostgreSQL and ClickHouse.

The database no longer re-evaluates consent through row triggers on every
account, tweet, child, archive metadata, Storage, or digest write. The archive
worker, Firehose persistence worker, and autorefresh writer each fail closed at
their ingestion boundary. Rare triggers on `optin` and
`tes.blocked_scraping_users` remain so a newly recorded opt-out synchronously
tombstones existing data.

Do not deploy the trigger-removal migration until every active writer version
with those boundary checks is confirmed live. Deployment and writer cutover are
separate from this repository change.

## Migration ledger preflight

Production records the first two migrations under these canonical versions.
The repository filenames must match them exactly before any dry run or push:

- `20260816084512_delete_own_tweets.sql`
- `20260816084522_add_reversible_policy_tombstones.sql`

Do not repair, revert, or synthesize those ledger entries. Promote the universal
policy migration only from a clean release checkout after its final version is
reconciled with the production ledger.

## Universal historical reconciliation

Apply the fast universal-policy migration first, then keep every PostgreSQL
writer paused while this direct operator reconciles history. Do not run the
final universal-policy migration until the operator has recorded its durable
`verification` checkpoint.

The fast migration must report `archives`, `enriched_tweets`, `firehose`, and
`firehose_private` as private Storage buckets before reconciliation starts. An
absent optional bucket is acceptable; no configured Firehose bucket may remain
public. Keep these buckets private through finalization and worker startup
verification.

The operator is dry-run by default. It requires a direct/session PostgreSQL
connection as the `postgres` role; do not use the transaction-mode pooler. It
never prints credentials:

```bash
POLICY_BACKFILL_DATABASE_URL="$DIRECT_POSTGRES_URL" \
pnpm policy:reconcile-history
```

The preparation-only mode builds these indexes one at a time with
`CREATE INDEX CONCURRENTLY`, outside a transaction:

- `tweets_retweeted_username_lower_idx`
- `tweets_reply_to_username_lower_idx`
- `mentioned_users_screen_name_lower_idx`
- `liked_tweets_author_account_id_idx` (a non-expression partial index)

Only the first three are expression indexes. The operator checks their exact
table, expression shape, predicate, access method, and readiness. It
automatically drops and retries an invalid/not-ready index only when it has one
of these operator-owned names. A valid index with a different definition stops
the run for manual inspection. The invalid legacy
`idx_tweets_full_text_trgm` is never used or modified.

```bash
CONFIRM_POLICY_HISTORY_RECONCILIATION=reconcile-policy-history \
POLICY_BACKFILL_DATABASE_URL="$DIRECT_POSTGRES_URL" \
pnpm policy:reconcile-history --execute --prepare-only
```

Start with bounded liked-tweet batches. Every other phase is an idempotent,
set-based operation over indexed stable IDs or one corpus pass; there is no
per-blocked-account tweets scan. The liked-tweet fallback scans nearby heap
pages in physical order and commits each checkpointed batch independently.
This requires every PostgreSQL writer to remain paused; a restart safely skips
rows already attributed or tombstoned:

```bash
CONFIRM_POLICY_HISTORY_RECONCILIATION=reconcile-policy-history \
POLICY_BACKFILL_DATABASE_URL="$DIRECT_POSTGRES_URL" \
pnpm policy:reconcile-history \
  --execute --batch-size=250000 --max-liked-batches=1
```

Rerun the same command to resume. After observing database latency, lock waits,
WAL volume, replication lag, and disk headroom, use the production one-time
completion path. It performs one set-wise hash join into a session-temporary
stage, then attributes the small canonical intersection in bounded batches.
Remaining unknown authors are tombstoned in bounded physical-order batches with
a durable CTID checkpoint and no canonical-tweet lookup. The operator validates
and binds that cursor directly and disables sequential scans locally so each
batch begins with a TID range scan from the last committed heap position. Both
paths retain every `tweet_id`; stored `fts` values recompute from the resulting
`full_text`.

Every blocked-author or canonical write transaction first takes `SHARE` locks
on both PostgreSQL consent tables, then refreshes blocked identities, then
suppresses row triggers transaction-locally. An opt-out therefore cannot commit
between the policy snapshot and its write. The hash-join stage bounds `work_mem`
at 128 MB, all statements retain a finite 20-minute timeout, and no durable
write transaction updates more than `--batch-size` rows. Keep writers and any
`VACUUM FULL`, `CLUSTER`, or table rewrite paused until completion:

```bash
CONFIRM_POLICY_HISTORY_RECONCILIATION=reconcile-policy-history \
POLICY_BACKFILL_DATABASE_URL="$DIRECT_POSTGRES_URL" \
pnpm policy:reconcile-history \
  --execute --complete-liked
```

The completion path is restart-safe: it restages only remaining canonical rows,
while unknown rows resume from `unknown-ctid:(block,offset)`. The final empty
unknown batch writes `private.policy_backfill_progress.completed_at` directly;
it does not call the legacy keyset function or use a lexicographic sentinel.

Every executable run re-applies all idempotent core phases before verification,
even when older checkpoints exist. Each checkpoint stores both
`policy_version = 'universal_policy_tombstones_v1'` and the authoritative
PostgreSQL consent fingerprint computed immediately before it is written. If an
opt-out lands between phases, the final migration rejects mixed fingerprints;
rerun the operator to converge the new policy snapshot. New blocks are handled
synchronously by the policy-state event triggers. Every subsequent writer must
independently reload the authoritative policy snapshot before persisting its
batch.

The reconciliation keeps `public.tweets.tweet_id` and
`public.all_account.account_id`. It deletes content-bearing children only when
the blocked tweet is the outer/authored row, so an allowed outer tweet keeps its
inbound quote/retweet relationship to the blocked tweet tombstone. Copied RT
text and reply usernames are blanked without removing stable relationship IDs.
Missing reply targets with a known blocked stable account ID are inserted as
content-free tweet tombstones.

Before writing `verification = 0`, the operator requires zero blocked content
across accounts, authored tweets, copied RT/reply identity, profiles, tweet
children, mentions, liked tweets, archives, durable JSON, and the rebuilt
`global_activity_summary`. The retired `account_activity_summary` is cleared
with `WITH NO DATA` instead of paying for another content-bearing corpus build.
The operator also requires all ten current-fingerprint phase checkpoints and
all four indexes valid/ready. A read-only audit can never write the final
checkpoint:

```bash
POLICY_BACKFILL_DATABASE_URL="$DIRECT_POSTGRES_URL" \
pnpm policy:reconcile-history --verify-only
```

Both activity summaries remain revoked after reconciliation. Rebuilding and
verifying the global summary, and clearing the retired per-account summary,
remove their historical payloads but do not authorize restoring public serving
access.

## Legacy liked-tweet reconciliation

The universal rollout uses `policy:reconcile-history` above. The narrower
`policy:reconcile-liked-tweets` command remains available for a later isolated
repair, but do not substitute its checkpoint for the universal operator's
current-fingerprint `liked_tweets` and `verification` phases.

The universal migration deliberately does not rewrite or index the multi-million
row `public.liked_tweets` table. It immediately hides legacy content whose author
is unknown, installs a bounded reconciliation function, and adds the liked-tweet
and mentioned-user minimal tombstone constraints as `NOT VALID`. Active writers
must provide content-free tombstones for blocked or unattributed authors before
inserting. PostgreSQL still enforces a `NOT VALID` check on new and changed rows;
only the historical validation scans are deferred.

The operator accepts author provenance only from a matching canonical
`public.tweets` row. It retains an allowed payload after recording that author's
stable account ID. It blanks blocked-author payloads and anything that remains
unattributed. Each call advances a keyset checkpoint in the same transaction, so
an interrupted run resumes without OFFSET scans or duplicate work.

Inspect the content-free checkpoint without changing data:

```bash
POLICY_BACKFILL_DATABASE_URL="$DIRECT_POSTGRES_URL" \
pnpm policy:reconcile-liked-tweets
```

The operator also accepts `POSTGRES_CONNECTION_STRING`, or discrete
`POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`,
`POSTGRES_DATABASE`, and `POSTGRES_SSL` variables. User and database default to
`postgres`, port defaults to `5432`, and SSL defaults to `require`. Inject
credentials at command runtime; the operator never prints the connection URL or
password.

Keep every PostgreSQL writer paused after the fast migration commits. First run
the preparation phase. It creates `liked_tweets_author_account_id_idx`
concurrently, then reruns the tombstone sweep for the union of stable account
IDs in `tes.blocked_scraping_users` and explicit opt-outs in `public.optin`:

```bash
CONFIRM_LEGACY_LIKED_TWEETS_RECONCILIATION=reconcile-legacy-liked-tweets \
POLICY_BACKFILL_DATABASE_URL="$DIRECT_POSTGRES_URL" \
pnpm policy:reconcile-liked-tweets --execute --prepare
```

Do not resume writers unless this phase confirms that the concurrent index is
valid/ready and every blocked account was reconciled. Future opt-outs can then
scrub attributed liked-tweet rows through the index while the legacy batch job
continues.

Run a bounded slice. Start with small batches and increase only after checking
database latency, row-lock waits, WAL volume, replication lag, and disk headroom:

```bash
CONFIRM_LEGACY_LIKED_TWEETS_RECONCILIATION=reconcile-legacy-liked-tweets \
POLICY_BACKFILL_DATABASE_URL="$DIRECT_POSTGRES_URL" \
pnpm policy:reconcile-liked-tweets --execute --batch-size=1000 --max-batches=10
```

Rerun the same command to resume. A lock timeout rolls back only the current
batch and does not advance its checkpoint. Do not edit
`private.policy_backfill_progress` to skip ahead.

After a batch reports `completed: true`, use a separately authorized
maintenance step to validate both historical constraints:

```bash
CONFIRM_LEGACY_LIKED_TWEETS_RECONCILIATION=reconcile-legacy-liked-tweets \
POLICY_BACKFILL_DATABASE_URL="$DIRECT_POSTGRES_URL" \
pnpm policy:reconcile-liked-tweets \
  --execute --finalize
```

Preparation and finalization refuse to continue if a prior concurrent index
build left an invalid index. Inspect that exact index before an operator
separately authorizes `DROP INDEX CONCURRENTLY`; never hide the failure with
`IF NOT EXISTS`.

## Historical Parquet shutdown

The existing `enriched_tweets/enriched_tweets.parquet` object was produced by
an exporter that did not re-check PostgreSQL consent. The migration makes that
bucket private, but bucket privacy does not physically delete the old object.
During the same authorized maintenance window, delete the exact object through
the Storage API (never by deleting `storage.objects` metadata directly):

```bash
cd /path/to/community-archive
CONFIRM_DELETE_UNSAFE_PARQUET=delete-enriched-tweets-parquet \
SUPABASE_URL="$SUPABASE_URL" \
SUPABASE_SERVICE_ROLE="$SUPABASE_SERVICE_ROLE" \
pnpm exec tsx scripts/delete_unsafe_parquet_export.mts
```

Then verify the former public URL returns no object. The website, agent docs,
Portal, and scheduled release verifier must remain disabled until a replacement
exporter filters every nested author against authoritative PostgreSQL consent
immediately before upload and supports policy-driven historical cleanup.

The retired browser-extension debug handler accepted arbitrary raw response
objects without policy metadata. Its historical objects cannot be selectively
reconciled, so empty that exact bucket in the same authorized window:

```bash
CONFIRM_EMPTY_LEGACY_DEBUG=empty-legacy-debug-bucket \
SUPABASE_URL="$SUPABASE_URL" \
SUPABASE_SERVICE_ROLE="$SUPABASE_SERVICE_ROLE" \
pnpm exec tsx scripts/delete_legacy_debug_storage.mts
```

## Firehose policy-safe objects

The same migration creates `private.policy_storage_objects`. Deploy it before
the Firehose build that writes `policy_safe_v1/` objects. Both buckets named by
the Firehose `PUBLIC_STORAGE_BUCKET_NAME` and `PRIVATE_STORAGE_BUCKET_NAME`
must have `public=false`; the workers refuse to start otherwise. After a
synthetic allowed upload, verify two content-free manifest rows are present,
block one indexed stable account ID, and verify the existing archive worker
deletes both objects and their manifest rows within one minute. Do not enable
the new writers if this reconciliation fails.

## Validation gates

- Run the policy pgTAP suite and nested archive insertion integration test.
- Confirm the migration installed both large-table checks as initially
  unvalidated and did not build `liked_tweets_author_account_id_idx` in the DDL
  transaction.
- Before writers resume, run `--prepare` and confirm the concurrent author index
  is valid/ready and the authoritative union of blocked accounts was swept.
- Run bounded liked-tweet batches to completion, then confirm the progress row,
  validated check, and valid/ready concurrent author index.
- Confirm `archives` and `enriched_tweets` are private buckets.
- Confirm blocked owners cannot upload or receive signed raw-archive URLs.
- Confirm the old Parquet object is absent through both public HTTP and the
  authenticated Storage listing.
- Confirm the retired `debug` Storage bucket is private and empty.
- Confirm policy cleanup jobs produce only ID-only tombstone manifests.
- Confirm Firehose Storage manifests contain only bucket class, object path,
  stable account IDs, one-way normalized username hashes, and timestamps; no
  payload or plaintext username columns.
- Confirm a later opt-out deletes already-ACKed Parquet and DLQ objects within
  the archive worker's one-minute reconciliation interval.

This runbook does not authorize deployment, migration application, or object
deletion. Those remain separate production actions.
