# Shelf worker

Derives a member's shelf (the works and tools they engaged with) from their own tweets and
writes it to the private `shelf` schema. The website reads it through `public.get_shelf` and
the owner curates it through `public.set_shelf_curation`; nothing is public until approved.

Pipeline, one tweet or one mention per request:

| Stage | Model | Output |
|---|---|---|
| gate | Jev `jev-1.13.0` (TypeSafe) | `shelf.answers` gate@1 per tweet |
| name | `gpt-6-luna` Responses API, strict JSON schema | `shelf.mentions`, `shelf.named_tweets` |
| stance | Jev | `shelf.answers` engaged/warm/cold/pointing/made/is_work per mention |
| derive | none | `shelf.items` (rebuilt per account), `shelf.resolutions` (titles, images) |

Facts are append-only, so a rerun only pays for tweets and mentions it has not seen. Model
choice, thresholds and their measurements are in `prototypes/shelf/research/` (local, untracked).

## Guards in this phase

- `--accounts` is required and must name accounts in `PHASE_ALLOWLIST` (@maskys_, @GarrisonLovely).
  There is no "all members" mode. Widening the list needs the product owner's go-ahead.
- `POSTGRES_HOST` must be loopback unless `SHELF_ALLOW_REMOTE_DB=1`.
- Membership (`bulletin.allowed_accounts`) is checked before processing and again before
  items are written; a non-member's items are deleted.
- Spending stops at `--max-usd` for the run and `--day-usd` across today's runs (`shelf.calls`).

## Run locally

Needs local Supabase with the shelf migration, a local ClickHouse loaded from the public export
(read-only user), and `TYPESAFE_API_KEY` plus `OPENAI_API_KEY` in an env file.

```bash
cd services/shelf
uv run --env-file ../../.env.local shelf_worker.py --accounts maskys_ GarrisonLovely --limit 50   # smoke
uv run --env-file ../../.env.local shelf_worker.py --accounts maskys_ GarrisonLovely
uv run --no-project --with 'psycopg[binary]==3.2.9' python -m unittest test_shelf
```

Env: `POSTGRES_HOST/PORT/USER/PASSWORD` (defaults: local Supabase 127.0.0.1:54322),
`CLICKHOUSE_LOCAL_URL/USER/PASSWORD` for `--source local-clickhouse`.

## Before production

1. Gateway route `member-tweets` in community-archive-control-panel (contract in `sources.py`),
   released before the worker uses `--source gateway`.
2. Manual production migration `20261008120000_shelf.sql`, then `pnpm migrations:check`.
3. Encrypted credentials for the TypeSafe and OpenAI keys on the worker host, as Bulletin does.
4. A trigger: a daily sweep keyed on `private.archive_clickhouse_delivery.delivered_at`.
Each step needs explicit authorization.
