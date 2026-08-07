# Community Archive Agent Guide

This is the canonical repository guidance for coding agents. It applies to the
entire repository. The current user request takes precedence, and executable
code and configuration take precedence over dated documentation.

## Project Map

Community Archive preserves Twitter/X archive exports in a searchable public
dataset and exposes the data for applications and research.

- Web app: Next.js 14 App Router, React 18, Tailwind CSS, and shadcn/ui.
- Backend: Supabase PostgreSQL, Auth, and Storage.
- Server state: TanStack Query.
- Archive processing: Docker worker under `services/process_archive/`.
- Tests: Jest and Testing Library.

The upload path is:

1. A user authenticates through Supabase Auth.
2. The browser validates and parses the archive.
3. Archive data is stored in Supabase Storage and an `archive_upload` row moves
   from `uploading` to `ready_for_commit`.
4. `services/process_archive/` claims the upload, marks it `committing`, writes
   the normalized PostgreSQL records, and marks it `completed` or `failed`.

Important locations:

- `src/app/`: pages, server actions, and API routes.
- `src/app/admin/`: administrative UI and actions.
- `src/lib/`: business logic, queries, and archive-upload code.
- `src/components/`: application components; primitives live in `ui/`.
- `src/utils/supabase.ts`: browser, server, script, and service-role clients.
- `services/process_archive/`: archive processor and its deployment docs.
- `supabase/schemas/`: declarative database source of truth.
- `supabase/migrations/`: applied migration history.
- `src/database-types.ts`: generated database types.
- `scripts/`: maintenance, migration, and data utilities.
- `docs/README.md`: documentation map.

## Working Safely

- Inspect the branch and working tree before editing. Preserve unrelated user
  changes and never sweep them into a commit.
- Keep unrelated topics on separate branches or worktrees. Do not silently
  switch branches, discard work, or close an existing task.
- Treat `.env*`, database URLs, service-role keys, access tokens, and user
  archive data as sensitive. Do not print, document, or commit them.
- Recheck live infrastructure before making placement or capacity decisions.
  Dated host RAM, disk, and workload snapshots are not authoritative.
- Production mutations require explicit authorization in the current task.
  This includes deploys, `supabase db push`, deletes, backfills, worker starts,
  and changes to live infrastructure.
- Prefer read-only diagnosis first. Consent to edit code does not imply consent
  to deploy it or modify production data.

## Database And Migration Workflow

The declarative schema is authoritative. For schema changes:

1. Edit the appropriate file in `supabase/schemas/`.
2. Generate a migration with `supabase db diff -f <descriptive_name>`.
3. Review the generated SQL in `supabase/migrations/`.
4. Regenerate `src/database-types.ts` when the schema changes.
5. Run focused schema, type, and application tests.

Do not hand-edit migration history unless the task specifically requires a
repair and the user understands the consequences.

Staging synchronization is automatic; production synchronization is not:

- `.github/workflows/sync-staging-db.yaml` runs for same-repository PRs and
  pushes to `main` that touch `supabase/**` or the sync script.
- The workflow serializes staging updates and regenerates database types on PR
  branches. Fork PRs are skipped because they cannot access staging secrets.
- Editing only `supabase/schemas/` is insufficient. Generate and commit the
  migration that the workflow can apply.
- Before merging a PR with migrations, run the read-only
  `pnpm migrations:check`. If production is behind, report the pending
  migration in the PR or handoff.
- Never turn that finding into a production `supabase db push` unless the user
  explicitly authorizes the production change in the current task.

## Supabase Invariants And Gotchas

- The project PostgREST limit is 1,000 rows. Any operation requiring every row
  must paginate with a stable `.order()` on a unique or indexed column. For
  counts, prefer `.select('*', { count: 'exact', head: true })`.
- `createServerAdminClient` is not service-role admin; it preserves the user's
  JWT through the SSR helper. Use `createServerServiceRoleClient` only in
  trusted server-only code that genuinely requires elevation.
- `user_metadata` is client-mutable and must not establish identity or
  authorization. Prefer provider identity from trusted JWT app metadata or
  `auth.users.identities`.
- `PostgrestError` is not an `Error` subclass. Do not rely on
  `instanceof Error`; use the project's error-description helpers.
- Upload phases use the PostgreSQL `upload_phase_enum`. Preserve the existing
  claim-before-process sequencing and failure handling when changing workers.

## Analytics Data Sources

- Use ClickHouse for corpus-scale read analytics when a supported gateway
  endpoint exists, including summaries, trends, stream analytics, and banger
  discovery. Cache expensive snapshots at an interval appropriate to the UI.
- Keep Supabase authoritative for authentication, writes, canonical membership,
  and records not represented in ClickHouse. Do not use the daily ClickHouse
  `memberAccounts` summary as the live uploader-plus-opt-in count.
- Develop and verify analytics changes locally first. For production-backed
  ClickHouse QA, retrieve the query-gateway bearer token from its authoritative
  host at command runtime without printing or persisting it. Use preview builds
  only for final staging verification.

## Development And Verification

Use Node 20 from `.nvmrc` and pnpm. Prefer the narrowest relevant check, then
expand verification in proportion to risk.

```bash
pnpm dev                 # Next.js with local Supabase
pnpm dev-remote-db       # Next.js with configured remote development DB
pnpm type-check
pnpm lint
pnpm format-check
pnpm test
pnpm test:server
pnpm test:db             # Requires the database test environment
pnpm build
```

After local schema changes, use `pnpm dev:gen-types`. `pnpm gen-types` targets
the configured remote Supabase project and therefore requires the appropriate
credentials and authorization.

For archive-worker commands and environment requirements, use
`services/process_archive/README_DOCKER.md` rather than copying deployment
instructions here.

## Git And Documentation Hygiene

- Make focused changes and run relevant checks before handoff.
- Keep commits atomic and stage only paths belonging to the task.
- Do not commit or push unless the user requested it or the active workflow
  explicitly includes publication.
- Update this file only with stable, project-specific instructions that are
  costly or risky to rediscover.
- Put temporary audits, refactor backlogs, incident narratives, and dated
  infrastructure inventories in issues or timestamped documentation, not in
  this always-loaded file.
- Prefer links to canonical code, workflows, and runbooks over duplicated
  explanations that can drift.
