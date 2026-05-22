#!/usr/bin/env tsx
/**
 * Apply migrations from `supabase/migrations/` that aren't yet in the
 * remote `supabase_migrations.schema_migrations` table. Each migration
 * runs in its own transaction; the schema_migrations row is inserted in
 * the same transaction so we never end up with code-applied / row-missing
 * (or vice versa).
 *
 * Why not `supabase db push`?
 *   The CLI refuses when remote has versions the local repo doesn't
 *   (`supabase migration repair --status reverted` is its suggested
 *   workaround, but that DELETES the schema_migrations rows for
 *   already-applied objects, which is the wrong fix). When the local
 *   repo is partially out of sync with prod, `db push` is too strict.
 *   This script targets exactly the gap that `pnpm migrations:check`
 *   reports, no more, no less.
 *
 * Usage:
 *   pnpm migrations:apply              # apply pending against PROD_DATABASE_URL
 *   pnpm migrations:apply --staging    # apply against STAGING_DATABASE_URL
 *   pnpm migrations:apply --url=…
 *   pnpm migrations:apply --dry-run    # list what would apply; no DB writes
 */

import { readFileSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import postgres from 'postgres'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const MIGRATIONS_DIR = resolve(REPO_ROOT, 'supabase', 'migrations')

dotenv.config({ path: resolve(process.cwd(), '.env') })

const MIGRATION_FILENAME_RE = /^(\d{14})_(.+)\.sql$/

type Target = 'prod' | 'staging' | 'custom'

function pickTarget(): { name: Target; url: string } {
  const args = process.argv.slice(2)
  const explicit = args.find((a) => a.startsWith('--url='))
  if (explicit) return { name: 'custom', url: explicit.slice('--url='.length) }
  if (args.includes('--staging')) {
    const url = process.env.STAGING_DATABASE_URL
    if (!url) {
      console.error('STAGING_DATABASE_URL is not set.')
      process.exit(2)
    }
    return { name: 'staging', url }
  }
  if (process.env.PROD_DATABASE_URL)
    return { name: 'prod', url: process.env.PROD_DATABASE_URL }
  const pwd = process.env.SUPABASE_DB_PASSWORD
  if (pwd) {
    return {
      name: 'prod',
      url: `postgres://postgres:${encodeURIComponent(pwd)}@db.fabxmporizzqflnftavs.supabase.co:5432/postgres`,
    }
  }
  console.error(
    'Set PROD_DATABASE_URL or SUPABASE_DB_PASSWORD in .env, or pass --url=<connection-string>.',
  )
  process.exit(2)
}

function readRepoMigrations() {
  const entries = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'))
  const out: { version: string; name: string; file: string; path: string }[] = []
  for (const f of entries) {
    const m = MIGRATION_FILENAME_RE.exec(f)
    if (!m) continue
    out.push({
      version: m[1],
      name: m[2],
      file: f,
      path: resolve(MIGRATIONS_DIR, f),
    })
  }
  out.sort((a, b) => a.version.localeCompare(b.version))
  return out
}

async function main() {
  const target = pickTarget()
  const isDryRun = process.argv.slice(2).includes('--dry-run')

  console.log(
    `${isDryRun ? '[DRY RUN] ' : ''}Applying pending migrations to ${target.name}…`,
  )

  const repo = readRepoMigrations()
  const sql = postgres(target.url, {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 10,
  })

  try {
    const applied = await sql<{ version: string }[]>`
      SELECT version FROM supabase_migrations.schema_migrations
    `
    const appliedSet = new Set(applied.map((r) => r.version))
    const pending = repo.filter((r) => !appliedSet.has(r.version))

    if (pending.length === 0) {
      console.log(
        `\n✓ Nothing to apply — ${target.name} already has all ${repo.length} repo migrations.`,
      )
      return
    }

    console.log(
      `\nWill apply ${pending.length} migration(s) (in order):\n` +
        pending.map((p) => `  ${p.version}  ${p.name}`).join('\n'),
    )

    if (isDryRun) {
      console.log('\n[DRY RUN] No DB writes performed.')
      return
    }

    for (const m of pending) {
      const t0 = Date.now()
      const body = readFileSync(m.path, 'utf8')
      try {
        await sql.begin(async (tx) => {
          // Apply the migration body.
          await tx.unsafe(body)
          // Record it in schema_migrations. We include `name` because the
          // table has that column (verified by pnpm migrations:check) — if
          // future Supabase versions drop the column this insert will
          // surface as a clear schema mismatch.
          await tx`
            INSERT INTO supabase_migrations.schema_migrations (version, name)
            VALUES (${m.version}, ${m.name})
          `
        })
        console.log(
          `  ✓ ${m.version}  ${m.name}  (${Date.now() - t0}ms)`,
        )
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error(
          `  ✗ ${m.version}  ${m.name}  FAILED — ${msg}\n` +
            `    Migration body was NOT committed (transactional rollback). ` +
            `Investigate before retrying. Subsequent migrations were NOT attempted.`,
        )
        process.exit(1)
      }
    }
    console.log(`\n✓ Applied ${pending.length} migration(s) to ${target.name}.`)
  } finally {
    await sql.end({ timeout: 2 })
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(2)
})
