# Community Archive - Agent Knowledge File

## Project Overview

**Community Archive** is a Twitter data preservation project that allows users to upload their Twitter archive exports to create a searchable public database. The goal is to preserve cultural/historical data from Twitter communities while providing open APIs for building apps on top of this data.

**Live at**: https://www.community-archive.org/

### Core Technologies
- **Frontend**: Next.js 14 (App Router), React 18, TailwindCSS, shadcn/ui
- **Backend**: Supabase (PostgreSQL + Auth + Storage + Edge Functions)
- **Data Processing**: Server-side archive processing via Docker worker
- **State Management**: TanStack Query (React Query)
- **Testing**: Jest with Testing Library

### Key Data Flow
1. User authenticates via Twitter OAuth through Supabase Auth
2. User uploads their Twitter archive zip file
3. Archive is parsed client-side, stored in Supabase Storage as JSON
4. An `archive_upload` record is created with phase `ready_for_commit`
5. A Docker worker (`services/process_archive/`) picks up pending uploads
6. Worker processes the archive JSON and inserts data into PostgreSQL tables
7. Upload phase transitions through: `uploading` → `ready_for_commit` → `committing` → `completed`

### Database Schema (key tables)
- `all_account` - Twitter accounts that have uploaded archives
- `all_profile` - Profile data (bio, avatar, header, location)
- `tweets` - Main tweet table with full-text search (tsvector)
- `mentioned_users` / `user_mentions` - User mention relationships
- `tweet_media` / `tweet_urls` - Tweet attachments
- `liked_tweets` / `likes` - User likes
- `followers` / `following` - Social graph
- `quote_tweets` / `retweets` - Tweet relationships
- `optin` - Opt-in status for tweet streaming feature
- `global_activity_summary` - Materialized view for stats

### Key Directories
- `src/app/` - Next.js pages and API routes
- `src/lib/` - Business logic, utilities, queries
- `src/components/` - React components (UI primitives in `ui/`)
- `services/process_archive/` - Docker-based archive processor
- `sql/` - SQL function definitions (organized by feature)
- `supabase/` - Supabase config, migrations, schemas
- `scripts/` - CLI utilities and one-off scripts

---

## Refactor Audit

### 🔴 Critical Issues

#### 1. Type Safety Erosion
```typescript
// services/process_archive/process_archive_upload.ts
type Sql = any  // Defeats TypeScript's entire purpose
```
The archive processor—the most critical part of the system—has no type safety for its database operations.

#### 2. Duplicated Supabase Config
`getSupabaseConfig()` is copy-pasted between:
- `src/utils/supabase.ts`
- `services/process_archive/process_archive_upload.ts`

Any environment variable changes require updating multiple files.

#### 3. Migration Drift
The `supabase/migrations-pending-review/` folder contains unapplied migrations dating back to March 2025. Schema changes are split across:
- `sql/tables/` (documentation)
- `supabase/schemas/` (declarative)
- `supabase/migrations/` (applied)
- `database.types.ts` (generated)

No single source of truth for schema.

#### 4. Dead/Disabled Code
```typescript
// process_archive_upload.ts:232
if (false && CONFIG.USE_COPY) { // COPY optimization disabled forever
```
The COPY optimization is permanently disabled but the code remains, adding 100+ lines of dead weight.

### 🟠 Architectural Issues

#### 5. Inconsistent Script Languages
The `scripts/` folder mixes `.js`, `.ts`, `.mts` files without clear reasoning:
- `check-tables.js` (JS)
- `import_from_files_to_db.ts` (TS)
- `download_supabase_storage.mts` (ESM TS)

#### 6. fp-ts Underutilization
`package.json` includes `fp-ts` but `src/lib/fp.ts` only has basic `pipe/compose` - no `Either`, `Option`, `TaskEither` for error handling. The codebase uses try/catch everywhere instead.

#### 7. Multiple Zip Libraries
Three zip handling libraries are installed:
- `@zip.js/zip.js` (runtime)
- `adm-zip` (dev)
- `unzipper` (dev)

Pick one.

#### 8. Monolithic Components
- `src/app/page.tsx` - 370+ lines, does data fetching inline
- `services/process_archive/process_archive_upload.ts` - 1000+ lines, single class

#### 9. State Machine as String Column
Upload phases (`uploading`, `ready_for_commit`, etc.) are just strings. No proper state machine validation—invalid transitions are possible.

### 🟡 Code Quality Issues

#### 10. Debug Artifacts in Production
```typescript
// src/hooks/useAuthAndArchive.tsx
if (process.env.NODE_ENV !== 'production') {
  window.supabase = supabase  // Global pollution
}
```
Also many `console.log` statements throughout.

#### 11. Magic Numbers
```typescript
const BATCH_SIZE = 1000
const MAX_MEMORY_MB = 1000
const MAX_RETRIES = 5
const RETRY_DELAY = 1000
```
Scattered across files without centralized config.

#### 12. Caching Disabled
```typescript
// src/app/page.tsx
export const revalidate = 0  // No caching on homepage
```
Homepage refetches all data on every request.

#### 13. Test Code Duplication
`patchArchive()` function is duplicated in:
- `services/process_archive/process_archive_upload.ts`
- `tests/db-insertion/db-insertion.test.ts`

#### 14. Gitignore Gaps
`scripts/circle-mitigation/tweet_data/` contains many run artifacts (JSON files, analysis results) that should be gitignored.

### 🟢 Minor Issues / Tech Debt

#### 15. Outdated Dependencies
- TypeScript 5.1.3 (current: 5.4+)
- Some @types packages are older versions

#### 16. Empty Directories
- `python/` directory exists but is empty

#### 17. Inconsistent Error Handling
Mix of:
- `throw new Error()` 
- Return `{ error }` objects
- Let errors propagate
- Try/catch with console.error

No consistent error boundary strategy.

#### 18. Homepage Data Fetching
Homepage does 3 async operations in the component body:
- `getMostFollowedAccounts()`
- `getOpenCollectiveContributors()`
- `getStats()`

Should use parallel fetching or data loading patterns.

#### 19. Lodash + fp-ts
Both `lodash` and `fp-ts` are dependencies. Should pick one FP utility approach.

---

## Recommended Refactoring Priority

### Phase 1: Safety & Correctness
1. Add proper types to `process_archive_upload.ts` (use `postgres.js` types)
2. Consolidate Supabase client factory into single module
3. Apply pending migrations or archive them
4. Remove dead COPY optimization code

### Phase 2: Architecture
1. Split `ArchiveUploadProcessor` into smaller modules
2. Implement proper error types with `fp-ts/Either`
3. Create state machine for upload phases
4. Centralize configuration/magic numbers

### Phase 3: Performance & DX
1. Enable homepage caching with proper revalidation
2. Consolidate zip libraries
3. Add proper streaming for large archives
4. Clean up test artifacts from git

### Phase 4: Code Quality
1. Remove debug console.logs
2. Add error boundaries to React components
3. Split homepage into smaller components
4. Standardize script file extensions

---

## Migrations & staging sync

**Staging deploy is automatic; prod is not.**

The `.github/workflows/sync-staging-db.yaml` workflow runs on every PR push that
touches `supabase/**` (path-filtered) and on push-to-`main`. On a PR push it:

1. Resets the staging Supabase DB from `supabase/migrations/` (so any new
   migration in your branch lands on staging).
2. Regenerates `src/database-types.ts` against the synced staging schema and
   auto-commits the result back onto your PR branch (`--no-verify` to skip the
   husky pre-commit hook that would re-run gen-types against a non-existent
   local supabase).

**To land a migration on staging without touching prod:**
- Add the migration under `supabase/migrations/` on your PR branch and push.
- The workflow runs automatically; staging gets the migration; prod stays
  unchanged.
- Prod migration happens later via `supabase db push` against the prod project
  (or whatever the maintainer runs after PR merge). Do not run `supabase db
  push` against prod yourself unless explicitly asked.

**Don't expect the workflow on fork PRs** — the job's `if:` guard skips it when
`pull_request.head.repo.full_name != github.repository` (forks can't access the
`Preview` environment secrets). Same-repo branches are fine.

**Concurrency:** the workflow uses a global mutex (`group: sync-staging-db`,
`cancel-in-progress: false`), so pushes from multiple PRs queue rather than
collide on the shared staging DB. Expect a wait if someone else just pushed.

**If you only edit `supabase/schemas/`** without producing a migration file,
the workflow still triggers (path filter is `supabase/**`) but nothing
applies — schemas are the declarative source of truth; migrations are what
actually gets pushed. Always run `supabase db diff -f <name>` to generate the
migration after editing schemas/.

### Pre-merge prod-migration check (REQUIRED for any PR that touches `supabase/migrations/`)

There is **no automation** that applies migrations to prod, and several
times now we've merged a PR with new migrations and forgotten to push
them. Symptoms: PostgREST returns `PGRST202` ("Could not find the
function …") or row-not-found errors, because prod's schema is behind
what the application code expects.

Before merging a PR with new migrations:

```bash
# Audit: are all the repo's migrations applied on prod?
PROD_DATABASE_URL=postgres://… pnpm migrations:check

# If it reports "✗ N migration(s) … NOT applied on prod":
supabase db push --db-url "$PROD_DATABASE_URL"

# Re-run to confirm in-sync:
pnpm migrations:check        # exits 0 when prod matches the repo
```

`pnpm migrations:check` reads `PROD_DATABASE_URL` (or constructs the
URL from `SUPABASE_DB_PASSWORD` + the prod project ref). To check
staging instead: `pnpm migrations:check:staging` (uses
`STAGING_DATABASE_URL`).

If you don't have prod write access, this is the maintainer's job —
mention "prod migration needed" in the PR description so the merge
doesn't slip past anyone.

### How prod ended up out of sync (so this doesn't happen again)

Each of these PRs introduced migrations that landed on staging but
**were never applied to prod**, in order:

  - #331: admin scrape-block RPCs + audit log table + nullable optin.user_id
  - #348: REVOKE delete_tweets from anon/authenticated

The user hit "function admin_set_scrape_block does not exist" weeks
after merge because of this. Avoid by following the pre-merge check
above.

## Quick Reference Commands

```bash
# Development
pnpm dev                    # Local DB
pnpm dev-remote-db          # Remote DB

# Type generation (after schema changes)
pnpm dev:gen-types          # Local
pnpm gen-types              # Remote

# Testing
pnpm test                   # All tests
pnpm test:db                # DB insertion tests

# Docker worker
pnpm docker:build:process-archive
pnpm docker:run:process-archive
```

## Environment Variables (key ones)
- `NEXT_PUBLIC_USE_REMOTE_DEV_DB` - Toggle local/remote DB
- `POSTGRES_CONNECTION_STRING` - For archive processor
- `SUPABASE_SERVICE_ROLE` - Admin operations
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Client access


