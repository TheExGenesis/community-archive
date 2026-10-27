import { randomUUID } from 'crypto'
import type { AgentSearchRunStore } from './runStore'
import type { AgentSearchRun } from './types'

/** A search run id, chosen before the workflow starts. */
export function newSearchRunId(): string {
  return `asr_${randomUUID().replace(/-/g, '')}`
}

/**
 * The Workflow run behind a search run. Rows stored before admission existed
 * used the workflow run id (`wrun_…`) as their own id.
 */
export function workflowRunIdOf(
  run: Pick<AgentSearchRun, 'id' | 'workflowRunId'>,
): string | null {
  if (run.workflowRunId) return run.workflowRunId
  return run.id.startsWith('wrun_') ? run.id : null
}

const TERMINAL = new Set(['completed', 'failed', 'cancelled'])

/** How long a run may sit admitted before its workflow must have started. */
export const START_GRACE_MS = 60_000

export const ENDED_WITHOUT_RESULT = 'The run ended without recording its result'
export const NEVER_STARTED = 'The run did not start'

/**
 * Closes the member's runs still marked running whose workflow has already
 * ended, or never started, so a crashed run frees the member's slot at once
 * instead of after the stale window. A run whose workflow is still running
 * keeps blocking. `workflowStatus` returns null when the status is unknown.
 */
export async function closeEndedRuns(
  store: Pick<AgentSearchRunStore, 'listRunning' | 'update'>,
  accountId: string,
  workflowStatus: (workflowRunId: string) => Promise<string | null>,
  now: Date = new Date(),
): Promise<string[]> {
  const closed: string[] = []
  for (const run of await store.listRunning(accountId)) {
    const workflowRunId = workflowRunIdOf(run)
    const age = now.getTime() - Date.parse(run.startedAt)
    let error: string | null = null
    if (!workflowRunId) {
      if (age > START_GRACE_MS) error = NEVER_STARTED
    } else {
      const status = await workflowStatus(workflowRunId)
      if (status && TERMINAL.has(status)) error = ENDED_WITHOUT_RESULT
    }
    if (!error) continue
    await store.update(run.id, {
      status: 'failed',
      error,
      completedAt: now.toISOString(),
    })
    closed.push(run.id)
  }
  return closed
}
