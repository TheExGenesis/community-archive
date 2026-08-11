Declarative Schemas: Setup and Workflow

Overview
- Declarative schemas declare the desired DB state under `supabase/schemas/**`. The Supabase CLI computes diffs and generates versioned migrations in `supabase/migrations/`.
- `supabase/schemas/prod.sql` is a legacy dump retained short‑term for compatibility, shrinking as we move definitions into ordered files.

Apply Order and File Layout
- The order is controlled by `db.migrations.schema_paths` in `supabase/config.toml`. Our canonical files, in order:
  - `000_extensions.sql` — extensions only
  - `000_roles.sql` — roles and role grants
  - `001_schemas.sql` — schemas
  - `010_types.sql` — custom types/enums
  - `020_tables.sql` — tables and PKs
  - `030_indexes.sql` — secondary indexes
  - `031_functions_prereq.sql` — helper objects needed by functions
  - `032_views_prereq.sql` — helper objects needed by views
  - `035_matviews.sql` — materialized views
  - `036_matview_indexes.sql` — matview indexes
  - `040_auth_helpers.sql` — minimal auth helpers (only `auth.jwt()`, `auth.uid()`)
  - `040_views.sql` — views
  - `050_constraints.sql` — FKs, uniques, checks not set inline
  - `060_grants.sql` — table/view grants and default privileges
  - `060_policies.sql` — RLS policies
  - `070_functions.sql` — functions and procedures
  - `080_triggers.sql` — CREATE TRIGGER wiring
  - `prod.sql` — legacy file; do not add new logic. Keep only grants/stragglers until fully migrated.

Authoring Guidelines
- Make changes in the canonical files above. Do not introduce new CREATEs in `prod.sql`.
- Exclude service‑managed internals; include only minimal auth helpers in `040_auth_helpers.sql`.
- Maintain ordering: definitions before references (functions before triggers, types before tables, etc.).
- RLS belongs in `060_policies.sql`. Follow the existing policy helpers.
- Grants:
  - Prefer grants in `060_grants.sql` (tables/views). Some function GRANTs may still live in `prod.sql`; we will migrate them over time.
- When moving an object out of `prod.sql`, remove the duplicate from `prod.sql` (comment it with “moved to …”).

Local Verification Loop
- Recreate local DB from declarative files:
  - `supabase db reset`
- Verify a no‑op diff (ensures ordering/duplicates are correct):
  - `supabase db diff -f verify_noop`
  - Expect: “No changes”. If not, fix duplicates or order.
- Update generated TS types if schema changed:
  - Remote types: `pnpm gen-types`
  - Local types: `pnpm dev:gen-types`

Creating and Applying Migrations
- One‑time:
  - `supabase login`
  - `supabase link --project-ref <PROJECT_REF>`
- After editing canonical files and validating locally:
  - Generate a migration: `supabase db diff -f <short_description>`
  - Commit schema edits + migration

Production Promotion and Verification

- A successful Supabase preview branch proves the migration on that branch; it
  does not promote the migration to production. Merging the pull request can
  deploy the Vercel frontend while the production database remains unchanged.
- Deploy a frontend dependency to production before merging the frontend when
  possible. If the merge has already happened, promote the database migration
  immediately and verify both layers.
- Promote from a clean worktree containing the exact committed migration:
  1. Link explicitly to the production project and confirm the project ref.
  2. Run `supabase migration list --linked`.
  3. Run `supabase db push --dry-run --linked`.
  4. Require the dry run to list only the intended migration or reviewed
     migration set.
  5. Run `supabase db push --linked`.
  6. Verify the exact version and name in
     `supabase_migrations.schema_migrations`, inspect the live objects or
     behavior, and run the security advisor after policies, functions, views,
     grants, or other security-sensitive changes.
  7. Repeat the dry run and require `Remote database is up to date.`
- Refactors should be a no-op; real changes will apply via the new migration.

Production Ahead of the Current Branch

- This can happen intentionally when another branch's backend dependency is
  deployed before its frontend is merged. The CLI then reports a remote
  migration version that is absent from the current worktree.
- Do not mark the remote migration reverted, synthesize a replacement version,
  or replay its SQL merely to make `db push` proceed. The remote migration
  ledger is authoritative.
- Locate the exact committed migration on its owning branch or pull request.
  Build a temporary deployment worktree that contains that exact file plus the
  migration being promoted, then rerun the dry run. Proceed only when the dry
  run lists the intended unapplied migration and nothing else.
- If the exact committed artifact cannot be found, stop and reconcile the
  repository with the remote ledger before changing production.

Common Patterns
- New table: `020_tables.sql` (+ indexes in `030_indexes.sql`, constraints in `050_constraints.sql`)
- New view: `040_views.sql`
- New function: `070_functions.sql`
- New trigger: function body in `070_functions.sql` (if needed) and `CREATE TRIGGER` in `080_triggers.sql`
- New policy: `060_policies.sql`
- New enum/type: `010_types.sql`

Do Not
- Don’t define the same object in multiple files (no duplicates).
- Don’t track service‑managed schemas (auth/storage internals).
- Don’t add new logic to `prod.sql`.

Troubleshooting
- Diff isn’t a no‑op:
  - Ensure objects aren’t duplicated between `prod.sql` and canonical files.
  - Check order dependencies (e.g., function depends on a type defined later).
- REVOKE/GRANT errors:
  - Ensure target objects exist before grants; move grants to a later file if necessary.
- Local reset failures:
  - Inspect the error line; adjust order or add prerequisites in `031_*` / `032_*` files.

Baselining Remote Ledger (empty or wiped)
- Symptom: `supabase migration list --linked` shows no applied migrations on the remote, but the database already contains your schema. `supabase db push` then fails on non‑idempotent CREATEs in baseline snapshot files (e.g., indexes, triggers).
- Fix: mark the baseline/no‑op migrations as applied on the remote without executing them.
  - Ensure you’re linked to the correct project: `supabase link --project-ref <PROJECT_REF>`
  - Newer CLI (v2 style):
    - `supabase migration repair --status applied --name 20250910105058_remote_schema.sql`
    - `supabase migration repair --status applied --name 20250910123454_comapreremote.sql`
    - `supabase migration repair --status applied --name 20250910141028_verify_noop.sql`
    - `supabase migration repair --status applied --name 20250912132817_verify_noop.sql`
  - Older CLI (v1 style):
    - `supabase db repair --status applied --migration 20250910105058_remote_schema.sql`
    - Repeat for each file above.
  - Verify: `supabase migration list --linked` shows them as applied. `supabase db push` should now be a no‑op unless you have newer migrations.
  - Temporary workaround (not preferred): move the baseline files to `supabase/migrations/_baseline/` to skip them for push, then restore and repair the ledger later to keep history consistent.
