import { randomUUID } from 'node:crypto'
import type postgres from 'postgres'

type Sql = postgres.Sql

// The worker side of the archive_upload phase machine (see
// supabase/migrations/20261107120000_archive_upload_commit_lease.sql):
//
//   ready_for_commit --claim--> committing --finish--> completed | failed
//                                   |                  | ready_for_commit
//                                   `--lease expires--> ready_for_commit
//                                       (or failed once reclaimed maxAttempts times)
//
// Every transition out of committing names the claim it holds, so a worker
// whose lease was taken over cannot overwrite the new owner's outcome.

export type CommitLeaseConfig = {
  leaseSeconds: number
  heartbeatMs: number
  maxAttempts: number
}

export type FinishedPhase = 'completed' | 'failed' | 'ready_for_commit'

export type ReclaimedUpload = {
  id: number
  upload_phase: 'ready_for_commit' | 'failed'
  commit_attempts: number
}

const positiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function commitLeaseConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): CommitLeaseConfig {
  const leaseSeconds = positiveInteger(env.ARCHIVE_COMMIT_LEASE_SECONDS, 900)
  const heartbeatMs = positiveInteger(
    env.ARCHIVE_COMMIT_HEARTBEAT_MS,
    Math.min(60_000, Math.floor((leaseSeconds * 1000) / 3)),
  )
  if (heartbeatMs * 2 > leaseSeconds * 1000) {
    throw new Error(
      'ARCHIVE_COMMIT_HEARTBEAT_MS must be at most half of ARCHIVE_COMMIT_LEASE_SECONDS',
    )
  }
  return {
    leaseSeconds,
    heartbeatMs,
    maxAttempts: positiveInteger(env.ARCHIVE_COMMIT_MAX_ATTEMPTS, 3),
  }
}

/**
 * Return rows whose committing lease expired (a crashed or killed worker) to
 * ready_for_commit, or fail them once they have been reclaimed maxAttempts
 * times, so an archive that keeps crashing the worker stops being retried.
 */
export async function reclaimExpiredCommitLeases(
  sql: Sql,
  config: CommitLeaseConfig,
): Promise<ReclaimedUpload[]> {
  const rows = await sql<ReclaimedUpload[]>`
    UPDATE public.archive_upload
    SET upload_phase = CASE
          WHEN commit_attempts + 1 >= ${config.maxAttempts}
            THEN 'failed'::public.upload_phase_enum
          ELSE 'ready_for_commit'::public.upload_phase_enum
        END,
        commit_attempts = commit_attempts + 1
    WHERE upload_phase = 'committing'
      AND commit_heartbeat_at < now() - make_interval(secs => ${config.leaseSeconds})
    RETURNING id, upload_phase, commit_attempts
  `
  return rows.map((row) => ({ ...row, id: Number(row.id) }))
}

/** Claim one ready upload. Returns the claim id, or null if another run won. */
export async function claimArchiveUpload(
  sql: Sql,
  archiveUploadId: number,
): Promise<string | null> {
  const claimId = randomUUID()
  const rows = await sql`
    UPDATE public.archive_upload
    SET upload_phase = 'committing',
        commit_claim_id = ${claimId}::uuid,
        commit_heartbeat_at = now()
    WHERE id = ${archiveUploadId}
      AND upload_phase = 'ready_for_commit'
    RETURNING id
  `
  return rows.length ? claimId : null
}

export type CommitHeartbeat = {
  /** True once a heartbeat found the claim gone (reclaimed by another run). */
  readonly lost: boolean
  stop(): void
}

export function startCommitHeartbeat(
  sql: Sql,
  archiveUploadId: number,
  claimId: string,
  config: CommitLeaseConfig,
  onError: (error: unknown) => void = () => {},
): CommitHeartbeat {
  let lost = false
  let inFlight = false
  const timer = setInterval(async () => {
    if (lost || inFlight) return
    inFlight = true
    try {
      const rows = await sql`
        UPDATE public.archive_upload
        SET commit_heartbeat_at = now()
        WHERE id = ${archiveUploadId}
          AND upload_phase = 'committing'
          AND commit_claim_id = ${claimId}::uuid
        RETURNING id
      `
      if (!rows.length) lost = true
    } catch (error) {
      // A transient failure only delays the heartbeat; the lease absorbs it.
      onError(error)
    } finally {
      inFlight = false
    }
  }, config.heartbeatMs)
  timer.unref?.()
  return {
    get lost() {
      return lost
    },
    stop() {
      clearInterval(timer)
    },
  }
}

/**
 * Leave committing. Returns false when this run no longer holds the claim,
 * in which case the row is left to its current owner.
 */
export async function finishArchiveUpload(
  sql: Sql,
  archiveUploadId: number,
  claimId: string,
  phase: FinishedPhase,
): Promise<boolean> {
  const rows = await sql`
    UPDATE public.archive_upload
    SET upload_phase = ${phase}::public.upload_phase_enum
    WHERE id = ${archiveUploadId}
      AND upload_phase = 'committing'
      AND commit_claim_id = ${claimId}::uuid
    RETURNING id
  `
  return rows.length > 0
}
