# Policy tombstone rollout

Do not deploy the web or worker changes independently of the matching database
migration. PostgreSQL consent must become the policy boundary before any writer
or private download endpoint depends on it.

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
