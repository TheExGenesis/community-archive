# Policy tombstone worker data contract

`private.admin_jobs` remains the durable queue. The job name
`admin_delete_with_export` is retained for compatibility, but current jobs are
cleanup jobs, not content exports. While queued, `args` contains the routing
fields `account_id`, `username`, and `enqueued_at`. On completion it is replaced
with `account_id`, `completed_at`, and the ID-only manifest prefix.

`private.worker_runs` records status and timings. The worker passes only
`account_id` and `enqueued_at` into its run record; it does not persist username,
reason, raw archive data, or authored table content.

The only Storage output is:

```text
admin-deleted-user-data/
  tombstones/<account_id>/<timestamp>/manifest.json
```

The manifest schema is:

```json
{
  "format": "community-archive-policy-tombstone-v1",
  "account_id": "stable-account-id",
  "tweet_ids": ["stable-tweet-id"],
  "content_free": true,
  "completed_at": "ISO-8601 timestamp"
}
```

The worker reads and deletes `archives/<username>/`; it never copies those
objects. `public.tombstone_policy_account` is the authoritative PostgreSQL
cleanup operation. Database triggers invoke it synchronously on policy blocks,
so the worker call is an idempotent second check plus Storage cleanup.
