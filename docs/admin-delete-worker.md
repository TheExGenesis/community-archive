# Policy tombstone cleanup worker

The Hetzner `admin-delete-worker` removes private raw archive objects after
PostgreSQL has synchronously applied an opt-out or administrator policy block.
Its historical queue name, `admin_delete_with_export`, is retained so existing
operational tooling keeps working. The worker no longer exports content.

## Privacy sequence

1. PostgreSQL serializes the account policy transition and replaces account and
   tweet content with stable-ID tombstones.
2. The `archives` bucket is private, so the policy-aware download endpoint stops
   serving the object immediately.
3. A deduplicated `private.admin_jobs` row routes the raw-object deletion.
4. The worker repeats the tombstone call idempotently, deletes
   `archives/<username>/`, and writes an ID-only tombstone manifest.
5. The legacy retention sweep removes old contentful export folders immediately;
   paths below `tombstones/` are retained.

An optional `CANONICAL_ADMIN_DELETE_SHADOW_PUBLISH_ENABLED=true` step runs only
after item 4. It sends content-free account and tweet tombstones to the
canonical publisher with a dedicated credential. Its failure is isolated from
the established deletion result, and it is disabled by default. PostgreSQL
remains the policy authority; this shadow copy is not a transactional outbox.

The shadow submits bounded mutation batches with identifier-only account/tweet
tombstones. Firehose creates canonical IDs and rechecks the authoritative block;
producer retries carry the same job ID, batch index and observation version.
Queue acceptance is not proof of erasure. User-facing delete RPCs are unchanged.
Before those can use this lane, add a transactional deletion intent/outbox,
per-sink completion tracking, persistent replay suppression and physical cleanup
of raw/replay copies. Source/archive retractions are reserved in the contract
but are rejected until provenance-aware sink execution is implemented.

The manifest contains only its format version, account ID, tweet IDs,
`content_free: true`, and completion timestamp. It must not contain username,
tweet text, profile fields, raw archives, opt-out reasons, requester identity, or
table dumps.

## Failure handling

PostgreSQL and public visibility are fail closed before the asynchronous worker
runs. A failed job can delay physical raw-object deletion, but the private bucket
and policy-aware download endpoint prevent serving it. Failed jobs remain visible
in `private.admin_jobs` and `private.worker_runs`. Failure rows deliberately
discard the username, so retry by re-enqueuing cleanup from the authoritative
policy row after fixing the underlying Storage or database error; do not return
the redacted job to `QUEUED`.

## Validation

```bash
pnpm --dir services/admin-delete-worker build
```

For a test account, verify:

- `public.all_account.is_tombstone` and every authored
  `public.tweets.is_tombstone` are true;
- content-bearing dependent rows are absent;
- no object remains below `archives/<username>/`;
- the only recovery object is an ID-only `tombstones/.../manifest.json`; and
- completed queue/run rows retain no username, reason, or authored content.

Do not merge, deploy, or cut over this worker without the matching PostgreSQL
and private-Storage migration.
