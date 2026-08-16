#!/usr/bin/env tsx

import 'dotenv/config'
import postgres from 'postgres'
import * as policyHistoryModule from './policy-history-reconciler.ts'
import type { IndexSpec, RequiredPhase } from './policy-history-reconciler.ts'

// The repository is CommonJS while this direct operator is an ESM entrypoint.
// tsx exposes imported .ts helpers under `default` in that combination.
const policyHistory =
  (
    policyHistoryModule as typeof policyHistoryModule & {
      default?: typeof policyHistoryModule
    }
  ).default ?? policyHistoryModule

const {
  BLOCKED_AUTHORED_TWEETS_SQL,
  CONFIRMATION,
  INDEX_SPECS,
  JOB_NAME,
  REPLY_USERNAME_SQL,
  REQUIRED_PHASES,
  RETWEET_PAYLOAD_SQL,
  VERIFICATION_PHASE,
  currentPolicyPhases,
  indexDefinitionMatches,
  parseOptions,
} = policyHistory

type IndexState = {
  name: string
  table_name: string
  access_method: string
  is_valid: boolean
  is_ready: boolean
  key_count: number
  total_count: number
  has_expression: boolean
  definition: string
}

type ProgressRow = {
  phase: string
  rows_affected: string | number
  completed_at: Date | string
  policy_version: string
  policy_fingerprint: string
}

type LikedProgress = {
  rows_processed: string | number
  authors_backfilled: string | number
  tombstones_written: string | number
  completed_at: Date | string | null
}

type LikedBatch = {
  batch_rows: number
  batch_authors_backfilled: number
  batch_tombstones_written: number
  checkpoint_tweet_id: string | null
  completed: boolean
  total_rows_processed: string | number
}

type ViolationRow = Record<string, string | number>

const HELP = `
Universal policy-history reconciler

Dry-run (default):
  POLICY_BACKFILL_DATABASE_URL="$DIRECT_POSTGRES_URL" \\
    pnpm policy:reconcile-history

Execute all resumable phases:
  CONFIRM_POLICY_HISTORY_RECONCILIATION=${CONFIRMATION} \\
  POLICY_BACKFILL_DATABASE_URL="$DIRECT_POSTGRES_URL" \\
    pnpm policy:reconcile-history --execute --complete-liked

Options:
  --execute                    Allow durable writes (requires confirmation)
  --prepare-only               Build/repair only the operator-owned indexes
  --verify-only                Run a read-only zero-violation audit
  --batch-size=N               Liked-tweet keyset batch (1-10000, default 5000)
  --max-liked-batches=N        Bounded batches per invocation (default 10)
  --complete-liked             Continue liked-tweet batches to completion
  --help                       Show this help
`

if (process.argv.includes('--help')) {
  await new Promise<void>((resolve) => {
    process.stdout.write(`${HELP.trim()}\n`, () => resolve())
  })
  process.exit(0)
}

const options = parseOptions(process.argv.slice(2), process.env)
const databaseUrl =
  process.env.POLICY_BACKFILL_DATABASE_URL ??
  process.env.POSTGRES_CONNECTION_STRING

function postgresSsl():
  | 'require'
  | 'allow'
  | 'prefer'
  | 'verify-full'
  | boolean {
  const value = process.env.POSTGRES_SSL?.trim().toLowerCase()
  if (!value) return 'require'
  if (value === 'true') return true
  if (value === 'false' || value === 'disable') return false
  if (
    value === 'require' ||
    value === 'allow' ||
    value === 'prefer' ||
    value === 'verify-full'
  ) {
    return value
  }
  throw new Error(
    'POSTGRES_SSL must be true, false, disable, require, allow, prefer, or verify-full',
  )
}

function postgresPort(): number {
  const value = Number(process.env.POSTGRES_PORT ?? 5432)
  if (!Number.isSafeInteger(value) || value < 1 || value > 65535) {
    throw new Error('POSTGRES_PORT must be an integer between 1 and 65535')
  }
  return value
}

if (
  !databaseUrl &&
  (!process.env.POSTGRES_HOST || !process.env.POSTGRES_PASSWORD)
) {
  throw new Error(
    'Set POLICY_BACKFILL_DATABASE_URL, POSTGRES_CONNECTION_STRING, or POSTGRES_HOST plus POSTGRES_PASSWORD',
  )
}

if (databaseUrl) {
  const parsed = new URL(databaseUrl)
  if (
    parsed.hostname.includes('pooler.supabase.com') &&
    parsed.port === '6543'
  ) {
    throw new Error(
      'Use the direct/session PostgreSQL endpoint; transaction-mode poolers cannot preserve operator checkpoints and temp state',
    )
  }
}

const commonConnectionOptions = {
  max: 1,
  idle_timeout: 5,
  connect_timeout: 10,
  prepare: false,
  connection: {
    application_name: 'community_archive_policy_history_reconciler',
  },
}

const sql = databaseUrl
  ? postgres(databaseUrl, commonConnectionOptions)
  : postgres({
      ...commonConnectionOptions,
      host: process.env.POSTGRES_HOST,
      port: postgresPort(),
      username: process.env.POSTGRES_USER ?? 'postgres',
      password: process.env.POSTGRES_PASSWORD,
      database: process.env.POSTGRES_DATABASE ?? 'postgres',
      ssl: postgresSsl(),
    })

function affected(result: { count: number | null }): number {
  return Number(result.count ?? 0)
}

async function assertFastMigrationContract(): Promise<void> {
  const [contract] = await sql<
    {
      progress_table: boolean
      liked_progress_table: boolean
      liked_batch_function: boolean
      policy_function: boolean
      liked_columns: boolean
      mentioned_column: boolean
      fingerprint_contract: boolean
      current_user: string
    }[]
  >`
    SELECT
      pg_catalog.to_regclass(
        'private.policy_historical_reconcile_progress'
      ) IS NOT NULL AS progress_table,
      pg_catalog.to_regclass('private.policy_backfill_progress') IS NOT NULL
        AS liked_progress_table,
      pg_catalog.to_regprocedure(
        'private.reconcile_legacy_liked_tweets_batch(integer)'
      ) IS NOT NULL AS liked_batch_function,
      pg_catalog.to_regprocedure(
        'public.policy_account_is_blocked(text,text)'
      ) IS NOT NULL AS policy_function,
      (
        SELECT pg_catalog.count(*) = 2
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'liked_tweets'
          AND column_name IN ('author_account_id', 'is_tombstone')
      ) AS liked_columns,
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'mentioned_users'
          AND column_name = 'is_tombstone'
      ) AS mentioned_column,
      (
        pg_catalog.to_regprocedure(
          'private.policy_authority_fingerprint()'
        ) IS NOT NULL
        AND (
          SELECT pg_catalog.count(*) = 2
          FROM information_schema.columns
          WHERE table_schema = 'private'
            AND table_name = 'policy_historical_reconcile_progress'
            AND column_name IN ('policy_version', 'policy_fingerprint')
        )
      ) AS fingerprint_contract,
      current_user
  `

  const missing = Object.entries(contract)
    .filter(([key, value]) => key !== 'current_user' && value !== true)
    .map(([key]) => key)
  if (missing.length > 0) {
    throw new Error(
      `Fast policy migration contract is incomplete: ${missing.join(', ')}`,
    )
  }
  if (contract.current_user !== 'postgres') {
    throw new Error(
      `Historical reconciliation requires the direct postgres role; connected as ${contract.current_user}`,
    )
  }
}

async function readProgress(): Promise<ProgressRow[]> {
  return sql<ProgressRow[]>`
    SELECT
      phase,
      rows_affected,
      completed_at,
      policy_version,
      policy_fingerprint
    FROM private.policy_historical_reconcile_progress
    WHERE job_name = ${JOB_NAME}
    ORDER BY completed_at, phase
  `
}

async function recordPhase(
  db: postgres.TransactionSql,
  phase: RequiredPhase | typeof VERIFICATION_PHASE,
  rowsAffected: number,
): Promise<void> {
  await db`
    INSERT INTO private.policy_historical_reconcile_progress (
      job_name,
      phase,
      rows_affected,
      completed_at,
      policy_version,
      policy_fingerprint
    ) VALUES (
      ${JOB_NAME},
      ${phase},
      ${rowsAffected},
      pg_catalog.now(),
      ${JOB_NAME},
      private.policy_authority_fingerprint()
    )
    ON CONFLICT (job_name, phase) DO UPDATE
    SET rows_affected = EXCLUDED.rows_affected,
        completed_at = EXCLUDED.completed_at,
        policy_version = EXCLUDED.policy_version,
        policy_fingerprint = EXCLUDED.policy_fingerprint
  `
}

async function clearVerificationCheckpoint(): Promise<void> {
  await sql`
    DELETE FROM private.policy_historical_reconcile_progress
    WHERE job_name = ${JOB_NAME}
      AND phase = ${VERIFICATION_PHASE}
  `
}

async function refreshBlockedIdentities(
  db: postgres.TransactionSql,
): Promise<void> {
  await db.unsafe(`
    CREATE TEMP TABLE IF NOT EXISTS policy_reconcile_blocked_accounts (
      account_id text PRIMARY KEY
    ) ON COMMIT PRESERVE ROWS
  `)
  await db.unsafe(`
    CREATE TEMP TABLE IF NOT EXISTS policy_reconcile_blocked_usernames (
      username_lower text PRIMARY KEY
    ) ON COMMIT PRESERVE ROWS
  `)
  await db.unsafe(`
    CREATE TEMP TABLE IF NOT EXISTS policy_reconcile_blocked_username_ids (
      username_lower text PRIMARY KEY,
      account_id text NOT NULL
    ) ON COMMIT PRESERVE ROWS
  `)
  await db.unsafe('TRUNCATE policy_reconcile_blocked_username_ids')
  await db.unsafe('TRUNCATE policy_reconcile_blocked_usernames')
  await db.unsafe('TRUNCATE policy_reconcile_blocked_accounts')

  await db.unsafe(`
    INSERT INTO policy_reconcile_blocked_accounts (account_id)
    SELECT NULLIF(pg_catalog.btrim(blocked.account_id), '')
    FROM tes.blocked_scraping_users AS blocked
    WHERE NULLIF(pg_catalog.btrim(blocked.account_id), '') IS NOT NULL
    UNION
    SELECT NULLIF(pg_catalog.btrim(consent.twitter_user_id), '')
    FROM public.optin AS consent
    WHERE consent.explicit_optout IS TRUE
      AND NULLIF(pg_catalog.btrim(consent.twitter_user_id), '') IS NOT NULL
    ON CONFLICT (account_id) DO NOTHING
  `)

  await db.unsafe(`
    INSERT INTO policy_reconcile_blocked_usernames (username_lower)
    SELECT lower(pg_catalog.btrim(blocked.username))
    FROM tes.blocked_scraping_users AS blocked
    WHERE NULLIF(pg_catalog.btrim(blocked.username), '') IS NOT NULL
    UNION
    SELECT lower(pg_catalog.btrim(consent.username))
    FROM public.optin AS consent
    WHERE consent.explicit_optout IS TRUE
      AND NULLIF(pg_catalog.btrim(consent.username), '') IS NOT NULL
    ON CONFLICT (username_lower) DO NOTHING
  `)

  await db.unsafe(`
    INSERT INTO policy_reconcile_blocked_accounts (account_id)
    SELECT DISTINCT account.account_id
    FROM public.all_account AS account
    JOIN policy_reconcile_blocked_usernames AS blocked
      ON blocked.username_lower = lower(account.username)
    ON CONFLICT (account_id) DO NOTHING
  `)

  await db.unsafe(`
    INSERT INTO policy_reconcile_blocked_usernames (username_lower)
    SELECT DISTINCT lower(account.username)
    FROM public.all_account AS account
    JOIN policy_reconcile_blocked_accounts AS blocked
      ON blocked.account_id = account.account_id
    WHERE NULLIF(pg_catalog.btrim(account.username), '') IS NOT NULL
    UNION
    SELECT DISTINCT lower(upload.username)
    FROM public.archive_upload AS upload
    JOIN policy_reconcile_blocked_accounts AS blocked
      ON blocked.account_id = upload.account_id
    WHERE NULLIF(pg_catalog.btrim(upload.username), '') IS NOT NULL
    ON CONFLICT (username_lower) DO NOTHING
  `)

  await db.unsafe(`
    INSERT INTO policy_reconcile_blocked_username_ids (
      username_lower, account_id
    )
    SELECT source.username_lower, pg_catalog.min(source.account_id)
    FROM (
      SELECT lower(pg_catalog.btrim(blocked.username)) AS username_lower,
             blocked.account_id
      FROM tes.blocked_scraping_users AS blocked
      WHERE NULLIF(pg_catalog.btrim(blocked.username), '') IS NOT NULL
        AND NULLIF(pg_catalog.btrim(blocked.account_id), '') IS NOT NULL
      UNION ALL
      SELECT lower(pg_catalog.btrim(consent.username)),
             consent.twitter_user_id
      FROM public.optin AS consent
      WHERE consent.explicit_optout IS TRUE
        AND NULLIF(pg_catalog.btrim(consent.username), '') IS NOT NULL
        AND NULLIF(pg_catalog.btrim(consent.twitter_user_id), '') IS NOT NULL
      UNION ALL
      SELECT lower(account.username), account.account_id
      FROM public.all_account AS account
      JOIN policy_reconcile_blocked_usernames AS username
        ON username.username_lower = lower(account.username)
      WHERE NULLIF(pg_catalog.btrim(account.username), '') IS NOT NULL
    ) AS source
    GROUP BY source.username_lower
    ON CONFLICT (username_lower) DO UPDATE
    SET account_id = EXCLUDED.account_id
  `)
}

async function inspectIndex(spec: IndexSpec): Promise<IndexState | undefined> {
  const rows = await sql<IndexState[]>`
    SELECT
      index_class.relname AS name,
      table_class.relname AS table_name,
      access_method.amname AS access_method,
      index_row.indisvalid AS is_valid,
      index_row.indisready AS is_ready,
      index_row.indnkeyatts::integer AS key_count,
      index_row.indnatts::integer AS total_count,
      index_row.indexprs IS NOT NULL AS has_expression,
      pg_catalog.pg_get_indexdef(index_row.indexrelid) AS definition
    FROM pg_catalog.pg_index AS index_row
    JOIN pg_catalog.pg_class AS index_class
      ON index_class.oid = index_row.indexrelid
    JOIN pg_catalog.pg_class AS table_class
      ON table_class.oid = index_row.indrelid
    JOIN pg_catalog.pg_namespace AS table_namespace
      ON table_namespace.oid = table_class.relnamespace
    JOIN pg_catalog.pg_am AS access_method
      ON access_method.oid = index_class.relam
    WHERE table_namespace.nspname = 'public'
      AND index_class.relname = ${spec.name}
  `
  return rows[0]
}

function assertExactIndex(state: IndexState, spec: IndexSpec): void {
  if (
    state.table_name !== spec.table ||
    state.access_method !== 'btree' ||
    state.key_count !== 1 ||
    state.total_count !== 1 ||
    state.has_expression !== spec.expression ||
    !indexDefinitionMatches(state.definition, spec)
  ) {
    throw new Error(
      `${spec.name} exists with an unexpected valid definition; inspect it manually instead of replacing it`,
    )
  }
}

async function ensureIndexes(): Promise<void> {
  await sql.unsafe("SET lock_timeout TO '5s'")
  await sql.unsafe("SET statement_timeout TO '0'")

  for (const spec of INDEX_SPECS) {
    let state = await inspectIndex(spec)
    if (state && (!state.is_valid || !state.is_ready)) {
      console.log(`Dropping incomplete ${spec.name} concurrently...`)
      await sql.unsafe(`DROP INDEX CONCURRENTLY public.${spec.name}`)
      state = undefined
    }

    if (state) {
      assertExactIndex(state, spec)
      console.log(`${spec.name}: valid and ready`)
      continue
    }

    console.log(`Creating ${spec.name} concurrently...`)
    await sql.unsafe(spec.createSql)
    state = await inspectIndex(spec)
    if (!state?.is_valid || !state.is_ready) {
      throw new Error(`${spec.name} did not become valid and ready`)
    }
    assertExactIndex(state, spec)
  }

  // Re-record this on every run so a policy change cannot leave the index
  // phase on an older authority fingerprint than the data phases.
  await sql.begin(async (db) => recordPhase(db, 'indexes', INDEX_SPECS.length))
}

async function runPhase(
  phase: Exclude<RequiredPhase, 'indexes' | 'liked_tweets'>,
  operation: (db: postgres.TransactionSql) => Promise<number>,
): Promise<void> {
  const rows = await sql.begin(async (db) => {
    await db.unsafe("SET LOCAL lock_timeout TO '5s'")
    await db.unsafe("SET LOCAL statement_timeout TO '20min'")
    await refreshBlockedIdentities(db)
    const rowsAffected = await operation(db)
    await recordPhase(db, phase, rowsAffected)
    return rowsAffected
  })
  console.log(`${phase}: complete (${rows} rows affected)`)
}

async function reconcileAccounts(db: postgres.TransactionSql): Promise<number> {
  const inserted = await db.unsafe(`
    INSERT INTO public.all_account (
      account_id,
      created_via,
      username,
      created_at,
      account_display_name,
      num_tweets,
      num_following,
      num_followers,
      num_likes,
      is_tombstone
    )
    SELECT
      blocked.account_id,
      'policy_tombstone',
      '',
      '1970-01-01 00:00:00+00',
      '',
      0,
      0,
      0,
      0,
      true
    FROM policy_reconcile_blocked_accounts AS blocked
    ON CONFLICT (account_id) DO UPDATE
    SET created_via = EXCLUDED.created_via,
        username = EXCLUDED.username,
        created_at = EXCLUDED.created_at,
        account_display_name = EXCLUDED.account_display_name,
        num_tweets = 0,
        num_following = 0,
        num_followers = 0,
        num_likes = 0,
        is_tombstone = true
    WHERE public.all_account.is_tombstone IS NOT TRUE
       OR public.all_account.created_via <> 'policy_tombstone'
       OR public.all_account.username <> ''
       OR public.all_account.account_display_name <> ''
       OR COALESCE(public.all_account.num_tweets, 0) <> 0
       OR COALESCE(public.all_account.num_following, 0) <> 0
       OR COALESCE(public.all_account.num_followers, 0) <> 0
       OR COALESCE(public.all_account.num_likes, 0) <> 0
  `)
  return affected(inserted)
}

async function reconcileAuthoredTweets(
  db: postgres.TransactionSql,
): Promise<number> {
  return affected(await db.unsafe(BLOCKED_AUTHORED_TWEETS_SQL))
}

async function reconcileRetweetPayloads(
  db: postgres.TransactionSql,
): Promise<number> {
  const anchors = await db.unsafe(`
    WITH candidates AS (
      SELECT DISTINCT
        relationship.retweeted_tweet_id AS tweet_id,
        blocked.account_id
      FROM public.tweets AS outer_tweet
      JOIN public.retweets AS relationship
        ON relationship.tweet_id = outer_tweet.tweet_id
      JOIN policy_reconcile_blocked_username_ids AS blocked
        ON blocked.username_lower = lower(substring(
          outer_tweet.full_text FROM '^RT @([A-Za-z0-9_]{1,15}):'
        ))
      WHERE outer_tweet.full_text ~ '^RT @[A-Za-z0-9_]{1,15}:'
        AND relationship.retweeted_tweet_id IS NOT NULL
    )
    INSERT INTO public.tweets (
      tweet_id,
      account_id,
      created_at,
      full_text,
      retweet_count,
      favorite_count,
      reply_to_tweet_id,
      reply_to_user_id,
      reply_to_username,
      archive_upload_id,
      is_tombstone
    )
    SELECT
      candidate.tweet_id,
      candidate.account_id,
      '1970-01-01 00:00:00+00',
      '',
      0,
      0,
      NULL,
      NULL,
      NULL,
      NULL,
      true
    FROM candidates AS candidate
    ON CONFLICT (tweet_id) DO NOTHING
  `)
  const [invalidAnchor] = await db<{ count: string | number }[]>`
    SELECT pg_catalog.count(*) AS count
    FROM public.tweets AS outer_tweet
    JOIN public.retweets AS relationship
      ON relationship.tweet_id = outer_tweet.tweet_id
    JOIN policy_reconcile_blocked_username_ids AS blocked
      ON blocked.username_lower = lower(substring(
        outer_tweet.full_text FROM '^RT @([A-Za-z0-9_]{1,15}):'
      ))
    LEFT JOIN public.tweets AS anchor
      ON anchor.tweet_id = relationship.retweeted_tweet_id
    WHERE outer_tweet.full_text ~ '^RT @[A-Za-z0-9_]{1,15}:'
      AND relationship.retweeted_tweet_id IS NOT NULL
      AND (
        anchor.tweet_id IS NULL
        OR anchor.account_id <> blocked.account_id
        OR anchor.is_tombstone IS NOT TRUE
      )
  `
  if (Number(invalidAnchor.count) !== 0) {
    throw new Error(
      `Retweet tombstone anchor verification failed for ${invalidAnchor.count} relationships`,
    )
  }
  const scrubbed = await db.unsafe(RETWEET_PAYLOAD_SQL)
  return affected(anchors) + affected(scrubbed)
}

async function reconcileReplyUsernames(
  db: postgres.TransactionSql,
): Promise<number> {
  const anchors = await db.unsafe(`
    WITH candidates AS (
      SELECT DISTINCT
        outer_tweet.reply_to_tweet_id AS tweet_id,
        COALESCE(by_id.account_id, by_username.account_id) AS account_id
      FROM public.tweets AS outer_tweet
      LEFT JOIN policy_reconcile_blocked_accounts AS by_id
        ON by_id.account_id = outer_tweet.reply_to_user_id
      LEFT JOIN policy_reconcile_blocked_username_ids AS by_username
        ON by_username.username_lower = lower(outer_tweet.reply_to_username)
      WHERE outer_tweet.reply_to_tweet_id IS NOT NULL
        AND COALESCE(by_id.account_id, by_username.account_id) IS NOT NULL
    )
    INSERT INTO public.tweets (
      tweet_id,
      account_id,
      created_at,
      full_text,
      retweet_count,
      favorite_count,
      reply_to_tweet_id,
      reply_to_user_id,
      reply_to_username,
      archive_upload_id,
      is_tombstone
    )
    SELECT
      candidate.tweet_id,
      candidate.account_id,
      '1970-01-01 00:00:00+00',
      '',
      0,
      0,
      NULL,
      NULL,
      NULL,
      NULL,
      true
    FROM candidates AS candidate
    ON CONFLICT (tweet_id) DO NOTHING
  `)
  const [invalidAnchor] = await db<{ count: string | number }[]>`
    SELECT pg_catalog.count(*) AS count
    FROM public.tweets AS outer_tweet
    LEFT JOIN policy_reconcile_blocked_accounts AS by_id
      ON by_id.account_id = outer_tweet.reply_to_user_id
    LEFT JOIN policy_reconcile_blocked_username_ids AS by_username
      ON by_username.username_lower = lower(outer_tweet.reply_to_username)
    LEFT JOIN public.tweets AS anchor
      ON anchor.tweet_id = outer_tweet.reply_to_tweet_id
    WHERE outer_tweet.reply_to_tweet_id IS NOT NULL
      AND COALESCE(by_id.account_id, by_username.account_id) IS NOT NULL
      AND (
        anchor.tweet_id IS NULL
        OR anchor.account_id <>
          COALESCE(by_id.account_id, by_username.account_id)
        OR anchor.is_tombstone IS NOT TRUE
      )
  `
  if (Number(invalidAnchor.count) !== 0) {
    throw new Error(
      `Reply tombstone anchor verification failed for ${invalidAnchor.count} relationships`,
    )
  }
  const scrubbed = await db.unsafe(REPLY_USERNAME_SQL)
  return affected(anchors) + affected(scrubbed)
}

async function reconcileMentionedUsers(
  db: postgres.TransactionSql,
): Promise<number> {
  return affected(
    await db.unsafe(`
      UPDATE public.mentioned_users AS mentioned
      SET name = '',
          screen_name = '',
          is_tombstone = true
      WHERE (
        EXISTS (
          SELECT 1
          FROM policy_reconcile_blocked_accounts AS blocked
          WHERE blocked.account_id = mentioned.user_id
        )
        OR (
          mentioned.screen_name <> ''
          AND EXISTS (
            SELECT 1
            FROM policy_reconcile_blocked_usernames AS blocked
            WHERE blocked.username_lower = lower(mentioned.screen_name)
          )
        )
      )
      AND (
        mentioned.is_tombstone IS NOT TRUE
        OR mentioned.name <> ''
        OR mentioned.screen_name <> ''
      )
    `),
  )
}

async function reconcileDependents(
  db: postgres.TransactionSql,
): Promise<number> {
  await db.unsafe(`
    CREATE TEMP TABLE IF NOT EXISTS policy_reconcile_blocked_tweets (
      tweet_id text PRIMARY KEY
    ) ON COMMIT PRESERVE ROWS
  `)
  await db.unsafe(`
    CREATE TEMP TABLE IF NOT EXISTS policy_reconcile_blocked_uploads (
      upload_id bigint PRIMARY KEY
    ) ON COMMIT PRESERVE ROWS
  `)
  await db.unsafe('TRUNCATE policy_reconcile_blocked_tweets')
  await db.unsafe('TRUNCATE policy_reconcile_blocked_uploads')
  await db.unsafe(`
    INSERT INTO policy_reconcile_blocked_tweets (tweet_id)
    SELECT tweet.tweet_id
    FROM public.tweets AS tweet
    JOIN policy_reconcile_blocked_accounts AS blocked
      ON blocked.account_id = tweet.account_id
    ON CONFLICT DO NOTHING
  `)
  await db.unsafe(`
    INSERT INTO policy_reconcile_blocked_uploads (upload_id)
    SELECT upload.id
    FROM public.archive_upload AS upload
    JOIN policy_reconcile_blocked_accounts AS blocked
      ON blocked.account_id = upload.account_id
    ON CONFLICT DO NOTHING
  `)

  let total = 0
  for (const [schema, table] of [
    ['public', 'conversations'],
    ['public', 'tweet_media'],
    ['public', 'user_mentions'],
    ['public', 'tweet_urls'],
    ['public', 'quote_tweets'],
    ['public', 'retweets'],
    ['private', 'tweet_user'],
  ] as const) {
    total += affected(
      await db.unsafe(`
        DELETE FROM ${schema}.${table} AS detail
        USING policy_reconcile_blocked_tweets AS blocked
        WHERE detail.tweet_id = blocked.tweet_id
      `),
    )
  }

  for (const table of ['likes', 'followers', 'following'] as const) {
    total += affected(
      await db.unsafe(`
        DELETE FROM public.${table} AS activity
        WHERE EXISTS (
          SELECT 1
          FROM policy_reconcile_blocked_accounts AS blocked
          WHERE blocked.account_id = activity.account_id
        )
        OR EXISTS (
          SELECT 1
          FROM policy_reconcile_blocked_uploads AS blocked
          WHERE blocked.upload_id = activity.archive_upload_id
        )
      `),
    )
  }

  for (const table of [
    'all_profile',
    'profile_settings',
    'profile_curation',
  ] as const) {
    total += affected(
      await db.unsafe(`
        DELETE FROM public.${table} AS profile
        USING policy_reconcile_blocked_accounts AS blocked
        WHERE profile.account_id = blocked.account_id
      `),
    )
  }

  for (const table of ['tweet_media', 'all_profile', 'tweets'] as const) {
    total += affected(
      await db.unsafe(`
        UPDATE public.${table} AS archived
        SET archive_upload_id = NULL
        FROM policy_reconcile_blocked_uploads AS blocked
        WHERE archived.archive_upload_id = blocked.upload_id
      `),
    )
  }

  return total
}

async function reconcileJsonPayloads(
  db: postgres.TransactionSql,
): Promise<number> {
  let total = 0
  const [legacy] = await db<{ exists: boolean }[]>`
    SELECT pg_catalog.to_regclass(
      'private.archived_temporary_data'
    ) IS NOT NULL AS exists
  `
  if (legacy.exists) {
    total += affected(
      await db.unsafe(`
        DELETE FROM private.archived_temporary_data AS archived
        WHERE EXISTS (
          SELECT 1
          FROM policy_reconcile_blocked_accounts AS blocked
          WHERE blocked.account_id = archived.originator_id
        )
        OR public.policy_json_contains_blocked_author(archived.data)
      `),
    )
  }

  total += affected(
    await db.unsafe(`
      UPDATE public.digest_editions AS edition
      SET status = 'archived',
          published_at = NULL,
          content = jsonb_build_object(
            'policy_tombstone', true,
            'reconciled_at', pg_catalog.now()
          )
      WHERE public.policy_json_contains_blocked_author(edition.content)
    `),
  )
  total += affected(
    await db.unsafe(`
      UPDATE public.digest_runs AS run
      SET candidates = '[]'::jsonb,
          model_request = NULL,
          raw_response = NULL,
          parsed_output = NULL,
          events = '[]'::jsonb,
          response_id = NULL,
          error = NULL
      WHERE public.policy_json_contains_blocked_author(
        jsonb_build_array(
          run.candidates,
          run.model_request,
          run.raw_response,
          run.parsed_output
        )
      )
    `),
  )
  // This legacy per-account payload is intentionally retired/revoked. WITH NO
  // DATA removes the durable content without another full-corpus rebuild.
  await db.unsafe(
    'REFRESH MATERIALIZED VIEW public.account_activity_summary WITH NO DATA',
  )
  await db.unsafe('SELECT public.refresh_global_activity_summary()')
  return total
}

async function reconcileArchiveMetadata(
  db: postgres.TransactionSql,
): Promise<number> {
  let total = 0
  total += affected(
    await db.unsafe(`
      DELETE FROM ca_autorefresh.account_refresh_log AS refresh
      USING policy_reconcile_blocked_accounts AS blocked
      WHERE refresh.account_id = blocked.account_id
    `),
  )
  total += affected(
    await db.unsafe(`
      WITH cleanup_identity AS (
        SELECT DISTINCT
          upload.account_id,
          pg_catalog.btrim(upload.username) AS username
        FROM public.archive_upload AS upload
        JOIN policy_reconcile_blocked_accounts AS blocked
          ON blocked.account_id = upload.account_id
        WHERE NULLIF(pg_catalog.btrim(upload.username), '') IS NOT NULL

        UNION

        SELECT DISTINCT
          blocked.account_id,
          pg_catalog.btrim(blocked.username)
        FROM tes.blocked_scraping_users AS blocked
        JOIN policy_reconcile_blocked_accounts AS reconciled
          ON reconciled.account_id = blocked.account_id
        WHERE NULLIF(pg_catalog.btrim(blocked.username), '') IS NOT NULL

        UNION

        SELECT DISTINCT
          consent.twitter_user_id,
          pg_catalog.btrim(consent.username)
        FROM public.optin AS consent
        JOIN policy_reconcile_blocked_accounts AS blocked
          ON blocked.account_id = consent.twitter_user_id
        WHERE consent.explicit_optout IS TRUE
          AND NULLIF(pg_catalog.btrim(consent.username), '') IS NOT NULL
      )
      SELECT public.enqueue_policy_archive_cleanup(
        identity.account_id,
        identity.username,
        'Historical policy tombstone reconciliation'
      )
      FROM cleanup_identity AS identity
    `),
  )
  total += affected(
    await db.unsafe(`
      DELETE FROM public.archive_upload AS upload
      USING policy_reconcile_blocked_accounts AS blocked
      WHERE upload.account_id = blocked.account_id
    `),
  )
  return total
}

async function reconcileLikedTweets(): Promise<boolean> {
  await sql.begin(async (db) => {
    await db.unsafe("SET LOCAL lock_timeout TO '5s'")
    await db.unsafe("SET LOCAL statement_timeout TO '20min'")
    await refreshBlockedIdentities(db)
    await db.unsafe(`
      UPDATE public.liked_tweets AS liked
      SET full_text = '', is_tombstone = true
      FROM policy_reconcile_blocked_accounts AS blocked
      WHERE liked.author_account_id = blocked.account_id
        AND (liked.full_text <> '' OR liked.is_tombstone IS NOT TRUE)
    `)
  })

  const batchLimit = options.completeLiked
    ? Number.POSITIVE_INFINITY
    : options.maxLikedBatches
  let complete = false
  let batches = 0
  while (!complete && batches < batchLimit) {
    const [batch] = await sql<LikedBatch[]>`
      SELECT *
      FROM private.reconcile_legacy_liked_tweets_batch(${options.batchSize})
    `
    batches += 1
    complete = batch.completed
    console.log(
      `liked_tweets batch ${batches}: ${batch.batch_rows} rows; checkpoint=${batch.checkpoint_tweet_id ?? 'none'}; complete=${batch.completed}`,
    )
  }

  const [progress] = await sql<LikedProgress[]>`
    SELECT
      rows_processed,
      authors_backfilled,
      tombstones_written,
      completed_at
    FROM private.policy_backfill_progress
    WHERE job_name = 'legacy_liked_tweets_v1'
  `
  if (!progress?.completed_at) {
    console.log(
      `liked_tweets: bounded run stopped after ${batches} batches; rerun to resume`,
    )
    return false
  }

  await sql.begin(async (db) => {
    await recordPhase(db, 'liked_tweets', Number(progress.rows_processed))
  })
  console.log(
    `liked_tweets: complete (${progress.rows_processed} processed; ${progress.tombstones_written} tombstones)`,
  )
  return true
}

async function countLegacyJsonViolations(
  db: postgres.TransactionSql,
): Promise<number> {
  const [legacy] = await db<{ exists: boolean }[]>`
    SELECT pg_catalog.to_regclass(
      'private.archived_temporary_data'
    ) IS NOT NULL AS exists
  `
  if (!legacy.exists) return 0
  const [result] = await db<{ count: string | number }[]>`
    SELECT pg_catalog.count(*) AS count
    FROM private.archived_temporary_data AS archived
    WHERE EXISTS (
      SELECT 1
      FROM policy_reconcile_blocked_accounts AS blocked
      WHERE blocked.account_id = archived.originator_id
    )
    OR public.policy_json_contains_blocked_author(archived.data)
  `
  return Number(result.count)
}

async function readViolations(): Promise<Record<string, number>> {
  return sql.begin(async (db) => {
    await db.unsafe("SET LOCAL statement_timeout TO '20min'")
    await refreshBlockedIdentities(db)
    const [counts] = await db<ViolationRow[]>`
      SELECT
        (
          SELECT pg_catalog.count(*)
          FROM policy_reconcile_blocked_accounts AS blocked
          LEFT JOIN public.all_account AS account
            ON account.account_id = blocked.account_id
          WHERE account.account_id IS NULL
             OR account.is_tombstone IS NOT TRUE
             OR account.created_via <> 'policy_tombstone'
             OR account.username <> ''
             OR account.account_display_name <> ''
             OR COALESCE(account.num_tweets, 0) <> 0
             OR COALESCE(account.num_following, 0) <> 0
             OR COALESCE(account.num_followers, 0) <> 0
             OR COALESCE(account.num_likes, 0) <> 0
        ) AS accounts,
        (
          SELECT pg_catalog.count(*)
          FROM public.tweets AS tweet
          JOIN policy_reconcile_blocked_accounts AS blocked
            ON blocked.account_id = tweet.account_id
          WHERE tweet.is_tombstone IS NOT TRUE
             OR tweet.full_text <> ''
             OR tweet.favorite_count <> 0
             OR COALESCE(tweet.retweet_count, 0) <> 0
             OR tweet.reply_to_tweet_id IS NOT NULL
             OR tweet.reply_to_user_id IS NOT NULL
             OR tweet.reply_to_username IS NOT NULL
             OR tweet.archive_upload_id IS NOT NULL
        ) AS tweets_authored,
        (
          SELECT pg_catalog.count(*)
          FROM public.tweets AS tweet
          JOIN policy_reconcile_blocked_usernames AS blocked
            ON blocked.username_lower = lower(substring(
              tweet.full_text FROM '^RT @([A-Za-z0-9_]{1,15}):'
            ))
          WHERE tweet.full_text ~ '^RT @[A-Za-z0-9_]{1,15}:'
            AND tweet.full_text <> ''
        ) AS tweets_retweet_payloads,
        (
          SELECT pg_catalog.count(*)
          FROM public.tweets AS tweet
          WHERE tweet.reply_to_username IS NOT NULL
            AND (
              EXISTS (
                SELECT 1
                FROM policy_reconcile_blocked_accounts AS blocked
                WHERE blocked.account_id = tweet.reply_to_user_id
              )
              OR EXISTS (
                SELECT 1
                FROM policy_reconcile_blocked_usernames AS blocked
                WHERE blocked.username_lower = lower(tweet.reply_to_username)
              )
            )
        ) AS tweets_reply_usernames,
        (
          SELECT pg_catalog.count(*)
          FROM public.tweets AS outer_tweet
          JOIN policy_reconcile_blocked_accounts AS blocked
            ON blocked.account_id = outer_tweet.reply_to_user_id
          LEFT JOIN public.tweets AS anchor
            ON anchor.tweet_id = outer_tweet.reply_to_tweet_id
          WHERE outer_tweet.reply_to_tweet_id IS NOT NULL
            AND (
              anchor.tweet_id IS NULL
              OR anchor.account_id <> blocked.account_id
              OR anchor.is_tombstone IS NOT TRUE
            )
        ) AS missing_reply_tombstones,
        (
          SELECT pg_catalog.count(*)
          FROM public.mentioned_users AS mentioned
          WHERE (
            EXISTS (
              SELECT 1
              FROM policy_reconcile_blocked_accounts AS blocked
              WHERE blocked.account_id = mentioned.user_id
            )
            OR (
              mentioned.screen_name <> ''
              AND EXISTS (
              SELECT 1
              FROM policy_reconcile_blocked_usernames AS blocked
              WHERE blocked.username_lower = lower(mentioned.screen_name)
              )
            )
          )
          AND (
            mentioned.is_tombstone IS NOT TRUE
            OR mentioned.name <> ''
            OR mentioned.screen_name <> ''
          )
        ) AS mentioned_users,
        (
          SELECT pg_catalog.count(*)
          FROM public.liked_tweets AS liked
          WHERE (
            liked.author_account_id IS NULL
            AND (liked.full_text <> '' OR liked.is_tombstone IS NOT TRUE)
          ) OR (
            EXISTS (
              SELECT 1
              FROM policy_reconcile_blocked_accounts AS blocked
              WHERE blocked.account_id = liked.author_account_id
            )
            AND (liked.full_text <> '' OR liked.is_tombstone IS NOT TRUE)
          )
        ) AS liked_tweets,
        (
          SELECT pg_catalog.count(*)
          FROM public.all_profile AS profile
          JOIN policy_reconcile_blocked_accounts AS blocked
            ON blocked.account_id = profile.account_id
        ) + (
          SELECT pg_catalog.count(*)
          FROM public.profile_settings AS profile
          JOIN policy_reconcile_blocked_accounts AS blocked
            ON blocked.account_id = profile.account_id
        ) + (
          SELECT pg_catalog.count(*)
          FROM public.profile_curation AS profile
          JOIN policy_reconcile_blocked_accounts AS blocked
            ON blocked.account_id = profile.account_id
        ) AS profiles,
        (
          SELECT pg_catalog.count(*)
          FROM public.archive_upload AS upload
          JOIN policy_reconcile_blocked_accounts AS blocked
            ON blocked.account_id = upload.account_id
        ) AS archive_metadata,
        (
          SELECT pg_catalog.count(*)
          FROM public.digest_editions AS edition
          WHERE public.policy_json_contains_blocked_author(edition.content)
        ) + (
          SELECT pg_catalog.count(*)
          FROM public.digest_runs AS run
          WHERE public.policy_json_contains_blocked_author(
            jsonb_build_array(
              run.candidates,
              run.model_request,
              run.raw_response,
              run.parsed_output
            )
          )
        ) AS json_payloads,
        (
          SELECT pg_catalog.count(*)
          FROM public.global_activity_summary AS summary
          WHERE public.policy_json_contains_blocked_author(
            pg_catalog.to_jsonb(summary)
          )
        ) AS global_activity_summary,
        (
          SELECT CASE WHEN materialized.relispopulated THEN 1 ELSE 0 END
          FROM pg_catalog.pg_class AS materialized
          JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = materialized.relnamespace
          WHERE namespace.nspname = 'public'
            AND materialized.relname = 'account_activity_summary'
            AND materialized.relkind = 'm'
        ) AS account_activity_summary,
        (
          SELECT pg_catalog.count(*)
          FROM public.conversations AS detail
          JOIN public.tweets AS tweet ON tweet.tweet_id = detail.tweet_id
          JOIN policy_reconcile_blocked_accounts AS blocked
            ON blocked.account_id = tweet.account_id
        ) + (
          SELECT pg_catalog.count(*)
          FROM public.tweet_media AS detail
          JOIN public.tweets AS tweet ON tweet.tweet_id = detail.tweet_id
          JOIN policy_reconcile_blocked_accounts AS blocked
            ON blocked.account_id = tweet.account_id
        ) + (
          SELECT pg_catalog.count(*)
          FROM public.user_mentions AS detail
          JOIN public.tweets AS tweet ON tweet.tweet_id = detail.tweet_id
          JOIN policy_reconcile_blocked_accounts AS blocked
            ON blocked.account_id = tweet.account_id
        ) + (
          SELECT pg_catalog.count(*)
          FROM public.tweet_urls AS detail
          JOIN public.tweets AS tweet ON tweet.tweet_id = detail.tweet_id
          JOIN policy_reconcile_blocked_accounts AS blocked
            ON blocked.account_id = tweet.account_id
        ) + (
          SELECT pg_catalog.count(*)
          FROM public.quote_tweets AS detail
          JOIN public.tweets AS tweet ON tweet.tweet_id = detail.tweet_id
          JOIN policy_reconcile_blocked_accounts AS blocked
            ON blocked.account_id = tweet.account_id
        ) + (
          SELECT pg_catalog.count(*)
          FROM public.retweets AS detail
          JOIN public.tweets AS tweet ON tweet.tweet_id = detail.tweet_id
          JOIN policy_reconcile_blocked_accounts AS blocked
            ON blocked.account_id = tweet.account_id
        ) AS tweet_dependents,
        (
          SELECT pg_catalog.count(*)
          FROM public.likes AS activity
          JOIN policy_reconcile_blocked_accounts AS blocked
            ON blocked.account_id = activity.account_id
        ) + (
          SELECT pg_catalog.count(*)
          FROM public.followers AS activity
          JOIN policy_reconcile_blocked_accounts AS blocked
            ON blocked.account_id = activity.account_id
        ) + (
          SELECT pg_catalog.count(*)
          FROM public.following AS activity
          JOIN policy_reconcile_blocked_accounts AS blocked
            ON blocked.account_id = activity.account_id
        ) AS account_dependents
    `

    const legacyJson = await countLegacyJsonViolations(db)
    return {
      ...Object.fromEntries(
        Object.entries(counts).map(([key, value]) => [key, Number(value)]),
      ),
      archived_temporary_json: legacyJson,
    }
  })
}

async function verifyZeroViolations(record: boolean): Promise<boolean> {
  for (const spec of INDEX_SPECS) {
    const state = await inspectIndex(spec)
    if (!state?.is_valid || !state.is_ready) {
      console.error(`${spec.name}: missing, invalid, or not ready`)
      return false
    }
    assertExactIndex(state, spec)
  }

  const progress = await readProgress()
  const [authority] = await sql<{ fingerprint: string }[]>`
    SELECT private.policy_authority_fingerprint() AS fingerprint
  `
  const completePhases = currentPolicyPhases(progress, authority.fingerprint)
  const missingPhases = REQUIRED_PHASES.filter(
    (phase) => !completePhases.has(phase),
  )
  const violations = await readViolations()
  const nonzero = Object.entries(violations).filter(([, count]) => count !== 0)

  console.log('Zero-violation audit:')
  for (const [name, count] of Object.entries(violations)) {
    console.log(`  ${name}: ${count}`)
  }
  if (missingPhases.length > 0) {
    console.log(`  missing checkpoints: ${missingPhases.join(', ')}`)
  }

  if (nonzero.length > 0 || missingPhases.length > 0) return false

  if (record) {
    await sql.begin(async (db) => {
      await db.unsafe("SET LOCAL lock_timeout TO '5s'")
      await db.unsafe(
        'LOCK TABLE public.optin, tes.blocked_scraping_users IN SHARE MODE',
      )
      const [locked] = await db<
        { fingerprint: string; matching_phases: number }[]
      >`
        WITH authority AS (
          SELECT private.policy_authority_fingerprint() AS fingerprint
        )
        SELECT
          authority.fingerprint,
          pg_catalog.count(progress.phase)::integer AS matching_phases
        FROM authority
        LEFT JOIN private.policy_historical_reconcile_progress AS progress
          ON progress.job_name = ${JOB_NAME}
         AND progress.phase = ANY(
           ${REQUIRED_PHASES as unknown as string[]}::text[]
         )
         AND progress.policy_version = ${JOB_NAME}
         AND progress.policy_fingerprint = authority.fingerprint
        GROUP BY authority.fingerprint
      `
      if (locked.matching_phases !== REQUIRED_PHASES.length) {
        throw new Error(
          'Policy authority changed after reconciliation; rerun every phase before recording verification',
        )
      }
      await recordPhase(db, VERIFICATION_PHASE, 0)
    })
    console.log('verification: durable zero-violation checkpoint recorded')
  }
  return true
}

async function main(): Promise<void> {
  await assertFastMigrationContract()
  const existing = await readProgress()
  console.log(
    `Mode: ${options.execute ? 'EXECUTE' : 'DRY RUN'}; existing checkpoints: ${existing.map((row) => row.phase).join(', ') || 'none'}`,
  )

  if (!options.execute) {
    const clean = await verifyZeroViolations(false)
    if (!clean) {
      console.log('Dry run found work; no durable data or index was changed.')
    } else {
      console.log('Dry run is clean; no durable data or index was changed.')
    }
    return
  }

  await clearVerificationCheckpoint()
  await ensureIndexes()
  if (options.prepareOnly) return

  await runPhase('accounts', reconcileAccounts)
  await runPhase('tweets_authored', reconcileAuthoredTweets)
  await runPhase('tweets_retweet_payloads', reconcileRetweetPayloads)
  await runPhase('tweets_reply_usernames', reconcileReplyUsernames)
  await runPhase('mentioned_users', reconcileMentionedUsers)
  await runPhase('dependent_rows', reconcileDependents)
  await runPhase('json_payloads', reconcileJsonPayloads)
  await runPhase('archive_metadata', reconcileArchiveMetadata)

  if (!(await reconcileLikedTweets())) {
    process.exitCode = 2
    return
  }

  // The account phase can promote a username-only block to its stable ID,
  // which legitimately changes the authority fingerprint. Refresh the cheap
  // index checkpoint after all data phases so a single converged run can pass.
  await ensureIndexes()

  if (!(await verifyZeroViolations(true))) {
    throw new Error('Zero-violation verification failed')
  }
}

try {
  await main()
} finally {
  await sql.end({ timeout: 5 })
}
