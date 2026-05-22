#!/usr/bin/env tsx
/**
 * Compare the migrations checked into `supabase/migrations/` against the
 * versions present in `supabase_migrations.schema_migrations` on a remote
 * database (typically prod). Prints a clear report so you know what
 * `supabase db push` would actually do *before* you run it.
 *
 * Usage:
 *   PROD_DATABASE_URL=postgres://... pnpm migrations:check
 *   pnpm migrations:check --staging   # use STAGING_DATABASE_URL instead
 *   pnpm migrations:check --url=postgres://...
 *
 * Exits 0 when the remote is in sync with the repo, 1 when one or more
 * migrations from the repo are missing on the remote, 2 on configuration
 * errors. CI can wire this into the merge gate later.
 */

import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import dotenv from 'dotenv'
import postgres from 'postgres'

// Load .env explicitly because Node 18 doesn't support --env-file. dotenv
// is already a dep (used by other scripts), so no new install.
dotenv.config({ path: resolve(process.cwd(), '.env') })

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const REPO_ROOT = resolve(__dirname, '..')
const MIGRATIONS_DIR = resolve(REPO_ROOT, 'supabase', 'migrations')

const MIGRATION_FILENAME_RE = /^(\d{14})_(.+)\.sql$/

type Target = 'prod' | 'staging' | 'custom'

function pickTarget(): { name: Target; url: string } {
  const args = process.argv.slice(2)
  const explicit = args.find((a) => a.startsWith('--url='))
  if (explicit) {
    return { name: 'custom', url: explicit.slice('--url='.length) }
  }
  if (args.includes('--staging')) {
    const url = process.env.STAGING_DATABASE_URL
    if (!url) {
      console.error(
        'STAGING_DATABASE_URL is not set. Add it to .env or pass --url=<connection-string>.',
      )
      process.exit(2)
    }
    return { name: 'staging', url }
  }
  // Default: prod. Prefer PROD_DATABASE_URL; if not set, try to build one
  // from SUPABASE_DB_PASSWORD + a hardcoded project ref. The hardcoded ref
  // is the same one used in src/app/admin/data.ts (PRODUCTION_SUPABASE_HOST)
  // so this stays in lockstep if prod ever moves.
  if (process.env.PROD_DATABASE_URL) {
    return { name: 'prod', url: process.env.PROD_DATABASE_URL }
  }
  const pwd = process.env.SUPABASE_DB_PASSWORD
  if (pwd) {
    const projectRef = 'fabxmporizzqflnftavs'
    return {
      name: 'prod',
      url: `postgres://postgres:${encodeURIComponent(pwd)}@db.${projectRef}.supabase.co:5432/postgres`,
    }
  }
  console.error(
    'Set PROD_DATABASE_URL (full connection string) OR SUPABASE_DB_PASSWORD in .env. ' +
      'For staging: pass --staging. For arbitrary: pass --url=<connection-string>.',
  )
  process.exit(2)
}

function readRepoMigrations(): { version: string; name: string; file: string }[] {
  let entries: string[]
  try {
    entries = readdirSync(MIGRATIONS_DIR)
  } catch (e) {
    console.error(`Could not read ${MIGRATIONS_DIR}:`, (e as Error).message)
    process.exit(2)
  }
  const migrations = entries
    .filter((f) => f.endsWith('.sql'))
    .map((f) => {
      const m = MIGRATION_FILENAME_RE.exec(f)
      if (!m) {
        console.warn(`Skipping non-conformant migration filename: ${f}`)
        return null
      }
      return { version: m[1], name: m[2], file: f }
    })
    .filter((x): x is { version: string; name: string; file: string } => !!x)
  migrations.sort((a, b) => a.version.localeCompare(b.version))
  return migrations
}

async function readRemoteMigrations(
  url: string,
): Promise<{ version: string; name: string | null }[]> {
  const sql = postgres(url, {
    // Short-lived script; don't accumulate idle connections.
    max: 1,
    idle_timeout: 5,
    connect_timeout: 10,
  })
  try {
    // Supabase's schema_migrations has had different shapes over time.
    // Older deployments only have `version`; newer have `name` too. Use
    // information_schema to detect.
    const hasName = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'supabase_migrations'
          AND table_name   = 'schema_migrations'
          AND column_name  = 'name'
      ) AS exists
    `
    const rows = hasName[0]?.exists
      ? await sql<{ version: string; name: string | null }[]>`
          SELECT version, name FROM supabase_migrations.schema_migrations
           ORDER BY version ASC
        `
      : await sql<{ version: string }[]>`
          SELECT version FROM supabase_migrations.schema_migrations
           ORDER BY version ASC
        `.then((rs) => rs.map((r) => ({ ...r, name: null })))
    return rows
  } catch (e) {
    const msg = (e as Error).message
    if (msg.includes('relation') && msg.includes('does not exist')) {
      console.error(
        'supabase_migrations.schema_migrations table is missing on the remote. ' +
          'This is unusual — Supabase creates it on the first push. Run `supabase db push` ' +
          'against the remote and rerun this check.',
      )
      process.exit(2)
    }
    throw e
  } finally {
    await sql.end({ timeout: 2 })
  }
}

async function main() {
  const target = pickTarget()
  console.log(`Checking migrations against ${target.name} database…`)

  const [repo, remote] = await Promise.all([
    Promise.resolve(readRepoMigrations()),
    readRemoteMigrations(target.url),
  ])

  const repoVersions = new Set(repo.map((r) => r.version))
  const remoteVersions = new Set(remote.map((r) => r.version))

  const missingOnRemote = repo.filter((r) => !remoteVersions.has(r.version))
  const extraOnRemote = remote.filter((r) => !repoVersions.has(r.version))

  console.log(
    `\nRepo migrations:   ${repo.length}\nRemote migrations: ${remote.length}\n`,
  )

  if (extraOnRemote.length) {
    // Not necessarily wrong — could be a hotfix that landed direct via the
    // SQL editor — but worth pointing out so the user can decide whether to
    // backfill the file or revert the remote change.
    console.log('⚠ On the remote but NOT in the repo:')
    for (const r of extraOnRemote) {
      console.log(`  ${r.version}${r.name ? `  ${r.name}` : ''}`)
    }
    console.log()
  }

  if (missingOnRemote.length) {
    console.log(`✗ ${missingOnRemote.length} migration(s) in the repo are NOT applied on ${target.name}:`)
    for (const m of missingOnRemote) {
      console.log(`  ${m.version}  ${m.name}`)
    }
    console.log(
      `\nRun: supabase db push --db-url "$${target.name === 'prod' ? 'PROD_DATABASE_URL' : 'STAGING_DATABASE_URL'}"`,
    )
    process.exit(1)
  }

  console.log(`✓ ${target.name} is in sync with the repo.`)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(2)
})
