# Nightly digest publisher

`community-archive-nightly-digest.timer` runs at 07:30 UTC (11:30 PM PST or
12:30 AM PDT). The editorial day closes at 06:00 UTC; the extra ninety minutes
let the 03:00 UTC Autorefresh run, which normally finishes between about 06:00
and 07:05 UTC, land its tweets first. This is a fixed margin, not a completion
check: a slower Autorefresh run still publishes without that night's refresh.
The oneshot Bun
publisher reads candidates from the ClickHouse query gateway, asks Opus 5.5 for
one JSON object, performs one bounded repair only when deterministic validation
rejects the first response, then stages and publishes through Supabase.

The job is date-idempotent. It exits before generation when the date is already
published, records a stable `systemd:YYYY-MM-DD` run identifier, preserves an
editor-published edition, and can publish a previously completed run after a
transient failure. systemd restarts a failed job every 20 minutes, up to five
starts, so a brief gateway or database outage does not strand a finished
edition as a draft. A failed model or validation attempt remains a failed run
and those restarts stop at it without another model call.

## Trend stories step

Before the digest, the same oneshot unit runs
`services/nightly-digest/trend-stories.ts`. It reads the day's homepage
trending terms from the gateway's `weekly-keywords` route, fetches up to 50
evidence tweets per term from `trend-evidence` for the same seven-day window,
and asks one OpenRouter model (`TREND_STORIES_MODEL`, default
`moonshotai/kimi-k3`) to merge terms that tell the same story and explain each
one. Validation requires every term in exactly one story and only supplied
tweets; a rejected answer is retried with the error, up to three calls. Rows
land in `public.trend_stories` keyed by the homepage day (the window's
exclusive end) and back `/trending/[date]/[slug]` and the homepage trending
panel's tooltips.

The step is `ExecStart=-`, so its failure never blocks the digest, and it skips
a day that already has rows, so a digest restart never repeats the model call.
Stories persist indefinitely; an opt-out deletes any story citing the account
(`tombstone_policy_account`). The gateway only serves the current day, so a
missed day cannot be backfilled later. Run it alone with `--dry-run` (no
writes) or `--force` (regenerate today):

```sh
ssh prod-firehose 'systemd-run --wait --collect --pipe \
  --property=EnvironmentFile=/etc/community-archive-nightly-digest.env \
  --property=WorkingDirectory=/opt/community-archive-nightly-digest \
  /root/.bun/bin/bun services/nightly-digest/trend-stories.ts --dry-run'
```

## Runtime configuration

Create `/etc/community-archive-nightly-digest.env` as root with mode `0600`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT.supabase.co
SUPABASE_SERVICE_ROLE=...
OPENROUTER_API_KEY=...
CLICKHOUSE_ANALYTICS_API_URL=https://analytics.community-archive.org/analytics
CLICKHOUSE_ANALYTICS_API_TOKEN=...
# Optional: model for the trend stories step.
TREND_STORIES_MODEL=moonshotai/kimi-k3
```

The ClickHouse token's source of truth on `prod-firehose` is the running
`community-archive-query-gateway` process environment. Do not copy the stale
value from its environment file.

## Operations

Deploy without enabling the timer:

```sh
scripts/deploy-nightly-digest.sh prod-firehose
```

Run a production-data dry-run that performs no database writes:

```sh
ssh prod-firehose 'systemd-run --wait --collect --pipe \
  --property=EnvironmentFile=/etc/community-archive-nightly-digest.env \
  --property=WorkingDirectory=/opt/community-archive-nightly-digest \
  /root/.bun/bin/bun services/nightly-digest/publish.ts \
  --date 2026-08-21 --dry-run'
```

Then enable the recurring schedule:

```sh
ssh prod-firehose 'systemctl enable --now community-archive-nightly-digest.timer'
```

Inspect status and logs with:

```sh
systemctl status community-archive-nightly-digest.timer
journalctl -u community-archive-nightly-digest.service -n 200 --no-pager
```

To pause writes, disable the timer. To retry a failed date, inspect the saved
run first; preserve the ledger, resolve or publish it editorially, and only then
re-enable the timer.

### Validation repair diagnostics

The receiver reports the rejected field and its limit. The bounded repair
request includes that error and the complete JSON schema and asks the model
to rewrite complete sentences instead of truncating prose. Each response and
its cumulative token usage is saved before validation, including when both
attempts fail. Failures remain private and do not publish an invalid edition.

## Weekly digest

`community-archive-weekly-digest.timer` runs Mondays at 09:00 UTC on the same
host, with the same release directory and environment file. The oneshot
`services/nightly-digest/publishWeekly.ts` weaves the published daily editions
of the Monday–Sunday week that just ended into one weekly edition, using the
previous two published weekly editions for continuity, and publishes it to
`public.digest_weekly_editions` (one Opus 5.5 call plus at most one repair).
No ClickHouse access is needed.

- It skips a week that is already published.
- It waits (exits non-zero, systemd retries every 30 minutes, five starts) until
  Sunday's daily edition is published and at least five dailies exist.
- Each automated attempt is one row with workflow ID `systemd:weekly:<monday>`.
  A failed or interrupted attempt stays as a `failed`/`running` row and stops
  later retries, so no model call repeats implicitly.
- Health: `public.community_archive_monitoring_weekly_digest()` (aggregate only)
  feeds `community_archive_weekly_digest_healthy`; the edition is due by Monday
  12:00 UTC.

Dry-run a week against production data (no writes):

```sh
ssh prod-firehose 'systemd-run --wait --collect --pipe \
  --property=EnvironmentFile=/etc/community-archive-nightly-digest.env \
  --property=WorkingDirectory=/opt/community-archive-nightly-digest \
  /root/.bun/bin/bun services/nightly-digest/publishWeekly.ts \
  --week 2026-10-26 --dry-run'
```

Recover a failed week after fixing the cause, with a new workflow ID:

```sh
ssh prod-firehose 'systemd-run --wait --collect --pipe \
  --property=EnvironmentFile=/etc/community-archive-nightly-digest.env \
  --property=WorkingDirectory=/opt/community-archive-nightly-digest \
  /root/.bun/bin/bun services/nightly-digest/publishWeekly.ts \
  --week 2026-10-26 --workflow-run-id operator-recovery:weekly:2026-10-26:1'
```

Then verify `community_archive_weekly_digest_healthy == 1` and enable the timer:

```sh
ssh prod-firehose 'systemctl enable --now community-archive-weekly-digest.timer'
```
