# Policy tombstone cleanup worker

This worker consumes `private.admin_jobs` rows whose legacy-compatible
`job_name` is `admin_delete_with_export`. Despite that retained queue name, it
does not export authored content.

For every job it:

1. calls `public.tombstone_policy_account(account_id)` (idempotently);
2. deletes all objects under the private `archives/<username>/` prefix; and
3. writes `admin-deleted-user-data/tombstones/<account_id>/<timestamp>/manifest.json`
   containing only the account ID and stable tweet IDs.

The worker never copies a raw archive, profile, tweet text, table dump, opt-out
reason, username, or requester identity to recovery Storage. Its 15-minute
legacy sweep immediately removes contentful export folders created by older
worker versions while retaining `tombstones/` manifests.

## Local checks

```bash
pnpm --dir services/admin-delete-worker build
```

Required environment variables are `DATABASE_URL`, `SUPABASE_URL`, and
`SUPABASE_SERVICE_ROLE`. `POLL_INTERVAL_MS` defaults to 10 seconds. See
`docker-compose.yml` and `env.example` for runtime wiring.

The worker also has a disabled post-success canonical shadow copy. Set
`CANONICAL_ADMIN_DELETE_SHADOW_PUBLISH_ENABLED=true` only after the firehose
canonical stream and external publisher are separately enabled. It publishes
content-free account and tweet tombstones using the dedicated
`CANONICAL_PUBLISHER_API_KEY`; failure logs only a bounded error code and never
changes the completed legacy deletion result. The shadow copy is not a
transactional outbox and must not be used as the canonical deletion authority.

## Operational verification

- A policy block must make PostgreSQL rows content-free before the job is
  claimed.
- The raw `archives/<username>/` prefix must disappear after the job succeeds.
- The manifest must have `content_free: true` and contain only `account_id`,
  `tweet_ids`, format, and completion timestamp.
- `private.worker_runs` and `private.admin_jobs` must not retain username,
  reason, or other authored content after completion.

Do not deploy or cut over this worker independently of the PostgreSQL migration
that makes the `archives` bucket private and installs policy write triggers.
