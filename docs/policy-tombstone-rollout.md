# Policy tombstone rollout

Do not deploy the web or worker changes independently of the matching database
migration. PostgreSQL consent must become the policy boundary before any writer
or private download endpoint depends on it.

## Migration ledger preflight

Production records the first two migrations under these canonical versions.
The repository filenames must match them exactly before any dry run or push:

- `20260816084512_delete_own_tweets.sql`
- `20260816084522_add_reversible_policy_tombstones.sql`

Do not repair, revert, or synthesize those ledger entries. Promote the universal
policy migration only from a clean release checkout after its final version is
reconciled with the production ledger.

## Legacy liked-tweet reconciliation

The universal migration deliberately does not rewrite or index the multi-million
row `public.liked_tweets` table. It immediately hides legacy content whose author
is unknown, enforces content-free tombstones for every new write, installs a
bounded reconciliation function, and adds the liked-tweet and mentioned-user
minimal tombstone constraints as `NOT VALID`. PostgreSQL still enforces a
`NOT VALID` check on new and changed rows; only the historical validation scans
are deferred.

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
