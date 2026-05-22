import os from 'node:os'
import type postgres from 'postgres'

/**
 * Wraps writes to private.worker_runs. One row per job attempt: row
 * inserted as 'started' on claim, updated to 'succeeded'/'failed' on
 * completion. The row carries the args (for forensics), per-phase
 * timings (under result.phase_ms), and the error message on failure.
 *
 * The table is in `private` so it's not exposed via PostgREST. Querying
 * is via Supabase Studio SQL editor or psql against the prod DB. See
 * docs/admin-delete-worker.md → "Observability" for the canned
 * queries.
 */
export type RunStatus = 'started' | 'succeeded' | 'failed' | 'skipped'

export interface RunRecorder {
  start(args: {
    workerName: string
    jobKey: string
    jobName: string
    jobArgs: unknown
  }): Promise<number /* worker_runs.id */>
  finish(
    runId: number,
    args: {
      status: Exclude<RunStatus, 'started'>
      result?: unknown
      error?: string
    },
  ): Promise<void>
}

export function makeRunRecorder(sql: postgres.Sql): RunRecorder {
  const host = process.env.WORKER_HOST_LABEL || os.hostname()
  return {
    async start({ workerName, jobKey, jobName, jobArgs }) {
      const rows = await sql<{ id: number }[]>`
        INSERT INTO private.worker_runs
          (worker_name, job_key, job_name, status, args, host)
        VALUES
          (${workerName}, ${jobKey}, ${jobName}, 'started', ${sql.json(jobArgs as never)}, ${host})
        RETURNING id
      `
      return rows[0].id
    },
    async finish(runId, { status, result, error }) {
      await sql`
        UPDATE private.worker_runs
           SET status       = ${status},
               completed_at = now(),
               -- Computed in SQL so it's monotonic with the row's
               -- started_at even under clock skew on the worker host.
               duration_ms  = (EXTRACT(EPOCH FROM (now() - started_at)) * 1000)::int,
               result       = ${result ? sql.json(result as never) : null},
               error        = ${error ?? null}
         WHERE id = ${runId}
      `
    },
  }
}
