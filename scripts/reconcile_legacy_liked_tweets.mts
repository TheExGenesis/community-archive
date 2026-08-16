#!/usr/bin/env tsx

import 'dotenv/config'
import postgres from 'postgres'

const JOB_NAME = 'legacy_liked_tweets_v1'
const CONFIRMATION = 'reconcile-legacy-liked-tweets'
const INDEX_NAME = 'liked_tweets_author_account_id_idx'
const CONSTRAINT_NAME = 'liked_tweets_policy_tombstone_is_minimal'
const MENTION_CONSTRAINT_NAME = 'mentioned_users_policy_tombstone_is_minimal'

type BatchResult = {
  batch_rows: number
  batch_authors_backfilled: number
  batch_tombstones_written: number
  checkpoint_tweet_id: string | null
  completed: boolean
  total_rows_processed: string | number
}

type Progress = {
  last_tweet_id: string | null
  rows_processed: string | number
  authors_backfilled: string | number
  tombstones_written: string | number
  completed_at: Date | string | null
  updated_at: Date | string
}

function integerFlag(
  name: string,
  defaultValue: number,
  maximum: number,
): number {
  const prefix = `--${name}=`
  const raw = process.argv
    .slice(2)
    .find((argument) => argument.startsWith(prefix))
  if (!raw) return defaultValue

  const value = Number(raw.slice(prefix.length))
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}`)
  }
  return value
}

const execute = process.argv.includes('--execute')
const prepare = process.argv.includes('--prepare')
const finalize = process.argv.includes('--finalize')
const batchSize = integerFlag('batch-size', 1000, 10000)
const maxBatches = integerFlag('max-batches', 1, 1000)
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
if ((prepare || finalize) && !execute) {
  throw new Error('--prepare and --finalize require --execute')
}
if (prepare && finalize) {
  throw new Error('--prepare and --finalize are separate maintenance phases')
}
if (
  execute &&
  process.env.CONFIRM_LEGACY_LIKED_TWEETS_RECONCILIATION !== CONFIRMATION
) {
  throw new Error(
    `Set CONFIRM_LEGACY_LIKED_TWEETS_RECONCILIATION=${CONFIRMATION} to execute batches`,
  )
}

const commonConnectionOptions = {
  max: 1,
  idle_timeout: 5,
  connect_timeout: 10,
  prepare: false,
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

async function readProgress(): Promise<Progress | null> {
  const rows = await sql<Progress[]>`
    SELECT
      progress.last_tweet_id,
      progress.rows_processed,
      progress.authors_backfilled,
      progress.tombstones_written,
      progress.completed_at,
      progress.updated_at
    FROM private.policy_backfill_progress AS progress
    WHERE progress.job_name = ${JOB_NAME}
  `
  return rows[0] ?? null
}

async function readAuthorIndex(): Promise<
  { index_name: string; is_valid: boolean; is_ready: boolean } | undefined
> {
  const indexes = await sql<
    { index_name: string; is_valid: boolean; is_ready: boolean }[]
  >`
    SELECT
      index_class.relname AS index_name,
      index_row.indisvalid AS is_valid,
      index_row.indisready AS is_ready
    FROM pg_catalog.pg_index AS index_row
    JOIN pg_catalog.pg_class AS table_class
      ON table_class.oid = index_row.indrelid
    JOIN pg_catalog.pg_namespace AS table_namespace
      ON table_namespace.oid = table_class.relnamespace
    JOIN pg_catalog.pg_class AS index_class
      ON index_class.oid = index_row.indexrelid
    WHERE table_namespace.nspname = 'public'
      AND table_class.relname = 'liked_tweets'
      AND index_class.relname = ${INDEX_NAME}
  `

  return indexes[0]
}

async function ensureAuthorIndex(): Promise<void> {
  const existing = await readAuthorIndex()
  if (existing && (!existing.is_valid || !existing.is_ready)) {
    throw new Error(
      `${INDEX_NAME} exists but is invalid; inspect and remove it concurrently before retrying`,
    )
  }

  if (!existing) {
    console.log(`Creating ${INDEX_NAME} concurrently...`)
    await sql.unsafe(`
      CREATE INDEX CONCURRENTLY ${INDEX_NAME}
      ON public.liked_tweets (author_account_id)
      WHERE author_account_id IS NOT NULL
    `)
  }
}

async function preparePolicySweep(): Promise<void> {
  await ensureAuthorIndex()
  console.log(`Preparation verified: concurrent author index is ready`)
}

async function finalizeSchema(): Promise<void> {
  const existing = await readAuthorIndex()
  if (!existing?.is_valid || !existing.is_ready) {
    throw new Error(
      `${INDEX_NAME} must be valid and ready; run the --prepare phase first`,
    )
  }

  console.log(`Validating ${CONSTRAINT_NAME}...`)
  await sql.unsafe(`
    ALTER TABLE public.liked_tweets
    VALIDATE CONSTRAINT ${CONSTRAINT_NAME}
  `)

  console.log(`Validating ${MENTION_CONSTRAINT_NAME}...`)
  await sql.unsafe(`
    ALTER TABLE public.mentioned_users
    VALIDATE CONSTRAINT ${MENTION_CONSTRAINT_NAME}
  `)

  const [constraints] = await sql<
    { liked_valid: boolean; mentioned_valid: boolean }[]
  >`
    SELECT
      COALESCE(bool_and(constraint_row.convalidated)
        FILTER (WHERE table_class.relname = 'liked_tweets'), false) AS liked_valid,
      COALESCE(bool_and(constraint_row.convalidated)
        FILTER (WHERE table_class.relname = 'mentioned_users'), false) AS mentioned_valid
    FROM pg_catalog.pg_constraint AS constraint_row
    JOIN pg_catalog.pg_class AS table_class ON table_class.oid = constraint_row.conrelid
    JOIN pg_catalog.pg_namespace AS table_namespace ON table_namespace.oid = table_class.relnamespace
    WHERE table_namespace.nspname = 'public'
      AND (
        (table_class.relname = 'liked_tweets' AND constraint_row.conname = ${CONSTRAINT_NAME})
        OR
        (table_class.relname = 'mentioned_users' AND constraint_row.conname = ${MENTION_CONSTRAINT_NAME})
      )
  `

  const [verifiedIndex] = await sql<{ is_valid: boolean; is_ready: boolean }[]>`
    SELECT index_row.indisvalid AS is_valid, index_row.indisready AS is_ready
    FROM pg_catalog.pg_index AS index_row
    JOIN pg_catalog.pg_class AS index_class ON index_class.oid = index_row.indexrelid
    JOIN pg_catalog.pg_class AS table_class ON table_class.oid = index_row.indrelid
    JOIN pg_catalog.pg_namespace AS table_namespace ON table_namespace.oid = table_class.relnamespace
    WHERE table_namespace.nspname = 'public'
      AND table_class.relname = 'liked_tweets'
      AND index_class.relname = ${INDEX_NAME}
  `

  if (
    !constraints?.liked_valid ||
    !constraints.mentioned_valid ||
    !verifiedIndex?.is_valid ||
    !verifiedIndex.is_ready
  ) {
    throw new Error('policy finalization verification failed')
  }
  console.log(
    'Finalization verified: both constraints and concurrent index are valid',
  )
}

try {
  if (!execute) {
    const progress = await readProgress()
    console.log(
      JSON.stringify(
        {
          mode: 'status-only',
          job: JOB_NAME,
          progress: progress ?? 'not-started',
          requestedBatchSize: batchSize,
          requestedMaxBatches: maxBatches,
        },
        null,
        2,
      ),
    )
  } else if (prepare) {
    await preparePolicySweep()
  } else if (finalize) {
    const progress = await readProgress()
    if (!progress?.completed_at) {
      throw new Error(
        'Backfill is not complete; run bounded batches until completed before --finalize',
      )
    }
    await finalizeSchema()
  } else {
    let lastBatch: BatchResult | null = null
    for (let batchNumber = 1; batchNumber <= maxBatches; batchNumber += 1) {
      const [batch] = await sql<BatchResult[]>`
        SELECT *
        FROM private.reconcile_legacy_liked_tweets_batch(${batchSize})
      `
      if (!batch) throw new Error('Legacy liked-tweet batch returned no status')
      lastBatch = batch
      console.log(JSON.stringify({ batchNumber, ...batch }))
      if (batch.completed) break
    }

    if (!lastBatch) throw new Error('No reconciliation batch ran')
    if (lastBatch.completed) {
      console.log(
        'Backfill complete; rerun with --execute --finalize in the maintenance window',
      )
    } else {
      console.log(
        'Batch limit reached; rerun the same command to resume from the checkpoint',
      )
    }
  }
} finally {
  await sql.end({ timeout: 5 })
}
