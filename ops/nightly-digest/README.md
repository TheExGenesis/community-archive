# Nightly digest publisher

`community-archive-nightly-digest.timer` runs at 06:15 UTC (10:15 PM PST or
11:15 PM PDT), after the 06:00 UTC editorial-day boundary. The oneshot Bun
publisher reads candidates from the ClickHouse query gateway, asks
GLM-5.3-Flash for one JSON object, performs one bounded repair only when
deterministic validation rejects the first response, then stages and publishes
through Supabase.

The job is date-idempotent. It exits before generation when the date is already
published, records a stable `systemd:YYYY-MM-DD` run identifier, preserves an
editor-published edition, and can publish a previously completed run after a
transient database failure. A failed generation is retried once by systemd
after five minutes. The retry reuses the frozen candidates, prompt version, and
rendered prompt from the same run row. Each provider response, validation
error, and token count is persisted before repair or publication.

## Runtime configuration

Create `/etc/community-archive-nightly-digest.env` as root with mode `0600`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT.supabase.co
SUPABASE_SERVICE_ROLE=...
OPENROUTER_API_KEY=...
CLICKHOUSE_ANALYTICS_API_URL=https://analytics.community-archive.org/analytics
CLICKHOUSE_ANALYTICS_API_TOKEN=...
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

To pause writes, disable the timer. To retry a failed date after the bounded
automatic retry is exhausted, inspect the saved run first, then invoke the
publisher with `--date YYYY-MM-DD`. It claims the failed row and appends another
execution without deleting its ledger or replacing its frozen inputs.
