# Contributing to Community Archive

Thanks for helping out! This is the main web app (Next.js + Supabase) for
[community-archive.org](https://www.community-archive.org).

## Getting started

```bash
pnpm install
cp .env.example .env   # fill in Supabase values
pnpm dev               # http://localhost:3000
```

See [`docs/local-setup.md`](docs/local-setup.md) for the full local Supabase
setup, and [`AGENTS.md`](AGENTS.md) for an architecture overview and operational
notes.

## Before opening a PR

```bash
pnpm type-check   # tsc --noEmit
pnpm lint         # next lint
pnpm exec prettier --write <changed-files>
pnpm test -- <changed-test-file>  # when applicable
```

CI runs lint and type-check on every PR. Database tests (`pnpm test:db`) require
a running local Supabase and are not run in CI yet.

## Database / schema changes

Schema changes affect multiple services (the website, the firehose ingest
service, and the autorefresh pipeline all share one Postgres). Please:

- Add a migration under `supabase/migrations/` **and** update the matching
  declarative files under `supabase/schemas/`.
- Apply to **staging first** and follow
  [`docs/supabase-declarative-schemas.md`](docs/supabase-declarative-schemas.md)
  plus the production checklist in [`AGENTS.md`](AGENTS.md).
- Regenerate types with `pnpm gen-types` if the public/dev schema changed.

## Reporting issues

Open a GitHub issue (security, privacy, ingestion, and data-policy concerns are
especially welcome) or join the project Discord linked from the README. For
suspected security vulnerabilities, please avoid posting exploit details in a
public issue where possible.
