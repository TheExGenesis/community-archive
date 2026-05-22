import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import postgres from 'postgres'
import { logger } from './logger.ts'
import { exportAndDelete } from './exporter.ts'
import { makeRunRecorder } from './runRecorder.ts'

const WORKER_NAME = 'admin_delete_with_export'
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 10_000)

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) {
    logger.fatal({ env: name }, 'missing required env var')
    process.exit(2)
  }
  return v
}

async function main() {
  const DATABASE_URL = requireEnv('DATABASE_URL')
  const SUPABASE_URL = requireEnv('SUPABASE_URL')
  const SUPABASE_SERVICE_ROLE = requireEnv('SUPABASE_SERVICE_ROLE')

  const sql = postgres(DATABASE_URL, {
    max: 4, // small pool; one job at a time + a couple for the recorder
    idle_timeout: 30,
    connect_timeout: 10,
  })
  const storage = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const recorder = makeRunRecorder(sql)

  // Graceful shutdown: finish the in-flight job, then exit. SIGTERM is
  // what docker stop / systemd / k8s sends.
  let stopping = false
  for (const sig of ['SIGTERM', 'SIGINT'] as const) {
    process.on(sig, () => {
      logger.info({ sig }, 'shutdown signal received; finishing current loop then exiting')
      stopping = true
    })
  }

  logger.info(
    { poll_ms: POLL_INTERVAL_MS, worker: WORKER_NAME },
    'worker started; polling private.job_queue',
  )

  while (!stopping) {
    try {
      const did = await drainOnce(sql, storage, recorder)
      if (!did) {
        // Nothing to do — sleep until next poll. (If we DID do something
        // we loop immediately so a backlog drains fast.)
        await sleep(POLL_INTERVAL_MS, () => stopping)
      }
    } catch (e) {
      // Top-level catch is for *infrastructure* errors (DB went away,
      // etc.) — per-job errors are handled inside drainOnce. Log loudly,
      // back off, and keep polling.
      logger.error({ err: serializeError(e) }, 'top-level loop error; backing off')
      await sleep(POLL_INTERVAL_MS * 3, () => stopping)
    }
  }

  logger.info('worker stopped')
  await sql.end({ timeout: 5 })
}

/**
 * Tries to claim and process one job. Returns true if a job was
 * claimed (regardless of whether it succeeded), false if the queue
 * was empty.
 */
async function drainOnce(
  sql: ReturnType<typeof postgres>,
  // SupabaseClient's generic chain differs between the no-args overload
  // (createClient default) and the with-args overload we use at the
  // call site; both produce a structurally compatible client for our
  // use (just `.storage`). Loose-typed here, narrowed by the exporter
  // module's own SupabaseClient alias.
  storage: any,
  recorder: ReturnType<typeof makeRunRecorder>,
): Promise<boolean> {
  // Atomic claim: pick the oldest QUEUED row for our job_name, flip it
  // to PROCESSING in the same statement. RETURNING gives us the args.
  // The `FOR UPDATE SKIP LOCKED` lets multiple worker replicas share
  // the queue without stepping on each other; today there's only one
  // replica but this is cheap to do correctly upfront.
  const claimed = await sql<
    {
      key: string
      job_name: string
      args: {
        account_id: string
        username: string
        reason?: string
        requested_by_user_id?: string
        enqueued_at: string
      }
    }[]
  >`
    WITH next AS (
      SELECT key
      FROM private.job_queue
      WHERE job_name = ${WORKER_NAME}
        AND status   = 'QUEUED'
      ORDER BY timestamp ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE private.job_queue q
       SET status = 'PROCESSING'
      FROM next
     WHERE q.key = next.key
    RETURNING q.key, q.job_name, q.args
  `

  if (claimed.length === 0) return false

  const job = claimed[0]
  const jobLogger = logger.child({ job_key: job.key, account_id: job.args.account_id })
  jobLogger.info({ args: job.args }, 'claimed job')

  const runId = await recorder.start({
    workerName: WORKER_NAME,
    jobKey: job.key,
    jobName: job.job_name,
    jobArgs: job.args,
  })

  try {
    const result = await exportAndDelete(storage, sql, {
      accountId: job.args.account_id,
      username: job.args.username,
      reason: job.args.reason ?? 'Admin manual opt-out',
      requesterUserId: job.args.requested_by_user_id ?? '',
      enqueuedAt: job.args.enqueued_at,
    })
    await recorder.finish(runId, { status: 'succeeded', result })
    await sql`
      UPDATE private.job_queue
         SET status = 'DONE',
             args = COALESCE(args, '{}'::jsonb)
                    || jsonb_build_object(
                         'completed_at', now(),
                         'export_prefix', ${result.exportPrefix}::text
                       )
       WHERE key = ${job.key}
    `
    jobLogger.info({ result }, 'job done')
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    jobLogger.error({ err: serializeError(e) }, 'job failed')
    await recorder.finish(runId, {
      status: 'failed',
      error: message,
    })
    await sql`
      UPDATE private.job_queue
         SET status = 'FAILED',
             args = COALESCE(args, '{}'::jsonb)
                    || jsonb_build_object('error', ${message}::text, 'failed_at', now())
       WHERE key = ${job.key}
    `
  }
  return true
}

function sleep(ms: number, shouldStop: () => boolean): Promise<void> {
  // Wakes up every 250ms so SIGTERM during a long sleep doesn't
  // hold up shutdown.
  const tick = 250
  return new Promise((resolve) => {
    const start = Date.now()
    const id = setInterval(() => {
      if (shouldStop() || Date.now() - start >= ms) {
        clearInterval(id)
        resolve()
      }
    }, tick)
  })
}

function serializeError(e: unknown): unknown {
  if (e instanceof Error) {
    return { name: e.name, message: e.message, stack: e.stack }
  }
  return e
}

main().catch((e) => {
  logger.fatal({ err: serializeError(e) }, 'main() crashed')
  process.exit(1)
})
