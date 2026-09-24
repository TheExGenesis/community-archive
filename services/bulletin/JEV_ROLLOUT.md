# Jev Bulletin rollout

## Summary

The Jev worker screens every policy-eligible original post in the ClickHouse
window. It replaces the phrase gate and GLM classification. A batch disposition
question estimates P(ask or offer), an enrichment pass estimates P(direct reader
action), kind, response path, standing status and topic tags, and a value pass
uses public author profile and up to three representative posts to score value
and P(joke). Representative posts prioritize quote-engaged posts from the last
year, then fill from the author's most-liked archived posts. Source text and
author data are treated as untrusted prompt data.

The initial publication thresholds are P(ask or offer) ≥ 0.75,
P(direct reader action) ≥ 0.75, and P(joke) < 0.50, versioned in
`jev_model.py`. The score is ordinal, not a dollar value, and does not hide
low-value but genuine opportunities. Recommended sorting includes value ×
P(opportunity) × (1 − P(joke)); chronological sorting is unchanged. Saved Jev
answers and probabilities live in private `bulletin.jev_items`. The public
board still rechecks policy and the ClickHouse source hash before rendering.

Jev does not write prose. New notice summaries are source-text excerpts, and
no expiry or place is inferred. Explicit event dates may therefore require a
later metadata extraction pass; source links remain available on every card.
The existing admin refresh queue is a legacy worker path and must be disabled
during Jev cutover until a Jev-aware refresh flow is implemented. Admin prompt
versions continue to guide new Jev batches and are pinned per run.

Daily runs revisit up to 200 ready notices whose author reply context has not
been checked that UTC day. Jev marks a notice open or resolved only from an
explicit descendant reply by the same author; the exact reply ID and current
source hash are stored and reverified on board reads. Unknown or incomplete
context does not erase an earlier evidenced status.

## Shadow and historical import

1. Apply `20260924041500_bulletin_jev_shadow.sql` to the intended environment.
   It leaves `bulletin.pipeline_state.active='legacy'` and the current worker
   and board unchanged. Browser roles have no access to the new tables.
2. Run the local preflight with the frozen experiment ledgers:
   `uv run import_jev_snapshot.py --snapshot-dir <experiment-dir>`.
   The September 9–23 UTC snapshot has 17,593 eligible original posts. Under
   the initial thresholds the preflight expects 311 ready Jev notices. The
   import performs no paid model calls. Imported results retain their own
   experiment version because new daily runs include the current prompt and a
   combined enrichment question; overlapping daily scans may rescore those
   rows before cutover.
3. After separate approval for the bounded historical write, transfer only
   `snapshot.sqlite`, `jev.sqlite`, and `value.sqlite` into a mode-0700
   temporary directory on the worker host. Run `run_jev_import_service.py
   --snapshot-dir <that-directory> --apply` in a one-shot systemd unit with
   the existing encrypted `clickhouse_api_token` credential and the same
   `CLICKHOUSE_ANALYTICS_API_URL` as the daily unit. The wrapper reads the
   gateway token at runtime and loads PostgreSQL settings from the existing
   production env file; it does not print credentials. Remove the temporary
   snapshot files after verifying the import counts. The import writes only
   `bulletin.jev_items`, checks current membership, and rechecks current
   source hashes for ready notices. Skips are counted. Repeating it is safe.
4. Run `jev_worker.py --start 2026-09-23 --end <next complete UTC day>` to
   cover complete days after the frozen snapshot. An explicit worker backfill
   may use `--backfill-budget-usd` up to $1; this cap and the existing monthly
   cap are cumulative. A daily run covers the two previous complete UTC days
   and revisits pending work up to fourteen days old.

Before cutover, inspect status, ready counts by day/kind, changed-source and
policy skips, call ledger, exhausted retries, and a sample of highest-ranked
and borderline notices. Verify at least one normal, failure-retry, policy
change, and resumed partial scan. The local saved replay and disposable-DB
tests are initial evidence, not production health evidence.

## Cutover and rollback

Keep the legacy worker and board active during shadow verification. After the
separate cutover authorization:

1. Disable `ca-bulletin-refresh.timer` and server-only
   `BULLETIN_REFRESH_ENABLED`; stop/resolve queued legacy refresh requests.
2. Install the tested worker release on `ca-autorefresh` while retaining the
   previous release. Set `BULLETIN_PROCESSOR=jev` on the daily unit and run one
   bounded daily cycle. Confirm Jev run status, source verification, cost, and
   queue health while the board still serves legacy notices.
3. In one transaction, set `bulletin.pipeline_state.active='jev'`. Reload the
   signed-in board and confirm the expected count, categories and links. Check
   the next daily timer execution and alerting. The switch is the publication
   boundary; import and shadow runs alone do not publish Jev notices.

Rollback: set `active='legacy'`, restore the previous daily unit/release and
re-enable the refresh timer and site control. Do not delete Jev rows, legacy
decisions, calls, scans or run history. Check the signed-in board after the
switch. If a queued legacy refresh remains, reconcile it before resuming the
old daily worker. Production migration, shadow import, and cutover each require
their own explicit authorization under the project rollout rules.
