# Archive insertion performance plan

## Decision

Keep Supabase/PostgreSQL as the transactional source of truth and preserve the
current public schema and deletion RPC contracts during the optimization. Do
not move archive insertion to ClickHouse. ClickHouse remains the analytical
projection and a useful throughput reference.

The current worker already wraps one archive in a `sql.begin` transaction, so
an archive is committed atomically. The slow path is inside that transaction:
large batches use `INSERT ... ON CONFLICT DO UPDATE`, and a replay changes
`archive_upload_id` and `updated_at` even when the indexed tweet content is
unchanged. PostgreSQL does not rebuild an entire index, but each non-HOT update
creates a new heap tuple and new entries in every affected index. The `tweets`
table currently has 21 indexes, and indexed columns plus the update trigger
prevent HOT updates on this path.

The target design separates canonical entity values from archive membership.
It stages bulk input with `COPY`, inserts membership/provenance rows, and only
updates a canonical row when a canonical value is actually different.

## Measured baseline

Production evidence collected on 2026-07-27:

| Signal | Observed |
| --- | ---: |
| `tweets` live/dead rows | 14,504,468 / 224,093 |
| `tweets` table size/index count | 19 GB / 21 |
| `tweets` updates/HOT updates | 6,416,591 / 0 |
| `likes` live/dead rows | 20,230,370 / 3,785,984 |
| Worker tweet upsert statements | 98 calls, 490,000 rows |
| Worker tweet upsert total/mean time | 4,299,775 ms / 43,875 ms |
| Worker tweet upsert shared blocks read/dirtied/written | 4.43 M / 3.78 M / 1.48 M |
| ClickHouse batches at or above 100k rows | about 117,100 rows/s |

ClickHouse is much faster for append-heavy analytical ingestion, but it does
not provide the current Supabase transaction, foreign-key, trigger, RLS,
deletion, and API semantics. It is not an equivalent drop-in write path.

## Proposed schema boundary

Add per-archive membership tables, initially for the largest/replayed entity
families:

```sql
archive_tweet_membership (
  archive_upload_id bigint NOT NULL,
  tweet_id text NOT NULL,
  PRIMARY KEY (archive_upload_id, tweet_id)
)

archive_like_membership (
  archive_upload_id bigint NOT NULL,
  account_id text NOT NULL,
  tweet_id text NOT NULL,
  PRIMARY KEY (archive_upload_id, account_id, tweet_id)
)
```

Add equivalent membership tables only where deletion currently depends on the
canonical row's `archive_upload_id` (`followers`, `following`, and related
archive-owned rows). Keep the existing canonical columns and RPC signatures
through the compatibility window.

Compatibility rule for the legacy `archive_upload_id` column:

- it points to one currently contributing archive;
- a replay does not rewrite it merely because a newer archive also contains
  the row;
- deleting that archive reassigns the pointer to another membership;
- the canonical row is deleted only when no membership remains and no
  non-archive source owns it.

The migration must explicitly preserve `keep_private`, opt-out, streamed-row,
and archive-deletion behavior. A membership row is provenance, not automatic
permission to expose content.

## Staged insertion algorithm

1. Parse and normalize the archive exactly as today.
2. Allocate staging tables scoped by `archive_upload_id` and a unique attempt
   ID. Prefer unlogged staging tables so failed attempts do not amplify WAL.
3. Stream normalized rows into staging with PostgreSQL `COPY`.
4. Validate expected counts, required keys, and deterministic content hashes.
5. In one short final transaction:
   - insert new canonical rows;
   - update existing canonical rows only where canonical values are
     `IS DISTINCT FROM` staged values;
   - insert membership rows with `ON CONFLICT DO NOTHING`;
   - update dependent normalized tables with the same changed-row rule;
   - transition `archive_upload` to `completed`.
6. Drop or truncate the attempt's staging rows outside the commit transaction.

Staging is allowed to be partially written because it is not visible through
the public schema. Canonical rows, membership, and the completed phase remain
atomic.

Roll the path out behind:

```text
ARCHIVE_INSERT_STRATEGY=legacy|staged-membership
```

The default stays `legacy` until the correctness and performance gates pass.

## Test harness

Build the benchmark against an ephemeral PostgreSQL 15 instance initialized
from the production declarative schema, including indexes, triggers, functions,
and `pg_stat_statements`. Reuse the deterministic archive fixture generator
under `tests/db-insertion/fixtures`, but add parameterized fixtures large enough
to expose index and WAL costs.

Run both strategies against identical fresh database snapshots:

1. **Fresh archive:** 100k tweets and 500k likes.
2. **Exact replay:** the identical archive and upload account.
3. **Incremental replay:** 1% of engagement/content values changed.
4. **Overlapping archives:** two archives contribute the same tweet IDs.
5. **Mixed provenance:** streamed rows pre-exist before the archive.
6. **Failure injection:** fail during `COPY`, validation, and each merge stage.
7. **Deletion:** delete one of two overlapping archives, then the final
   contributing archive.
8. **Privacy:** private archives, opt-out, and mixed private/public membership.

Each scenario runs at least three measured iterations after one warm-up. The
harness writes machine-readable JSON and a Markdown comparison containing:

- wall-clock and final-transaction duration;
- rows per second by entity/table;
- rows inserted, truly updated, and skipped as unchanged;
- WAL bytes using `pg_wal_lsn_diff`;
- `n_tup_ins`, `n_tup_upd`, `n_tup_hot_upd`, and `n_dead_tup` deltas;
- shared blocks read/hit/dirtied/written from `pg_stat_statements`;
- table and index size deltas;
- peak worker RSS;
- deterministic row-count and content-hash comparisons.

## Acceptance gates

Correctness gates are absolute:

- no partially visible canonical archive after any injected failure;
- legacy and staged strategies produce the same public canonical result;
- replay is idempotent;
- deletion, overlap, streamed ownership, privacy, and opt-out fixtures pass;
- existing public API/RPC signatures remain usable.

Performance gates on the exact-replay fixture:

- fewer than 1% of canonical rows are updated;
- at least 90% less WAL and dead-tuple growth than the legacy path;
- at least 5x lower wall time.

For fresh ingestion, the staged path must be no more than 10% slower than the
legacy path and should be faster at the 100k/500k fixture size. Incremental
replay canonical updates should remain proportional to the changed 1%, not the
full archive.

## Rollout

1. Land membership schema and dual-write membership while reads/deletes still
   use the legacy pointer.
2. Run the benchmark in CI as a correctness suite; keep the large performance
   profile as an explicit or nightly job.
3. Enable staged insertion for a synthetic staging archive.
4. Enable one small production archive and compare worker timings, WAL,
   dead-row estimates, and dashboard backlog.
5. Ramp by archive size cohort while retaining the strategy flag.
6. Switch deletion to membership/reference-count semantics only after overlap
   and privacy audits pass.
7. Keep the old path for one release window, then remove it in a separate PR.

Rollback is a configuration change back to `legacy`; the dual-written
membership rows can remain unused and be reconciled before another rollout.
