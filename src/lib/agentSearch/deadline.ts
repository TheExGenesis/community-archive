// One deadline for a whole run, passed from the start route through every
// tool, scorer and gateway call, so a run cannot keep spending after its time
// is up. Plain values only: this module is also part of the workflow body.

/** Tool context: the run's deadline and, in scripts, an abort signal. */
export interface RunLimits {
  /** Epoch ms after which no new paid or gateway call starts. */
  deadlineAt?: number
  abortSignal?: AbortSignal
}

export const DEFAULT_RUN_DEADLINE_MS = 300_000

/** AGENT_SEARCH_RUN_DEADLINE_MS, or the default for a missing or bad value. */
export function agentSearchRunDeadlineMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const value = env.AGENT_SEARCH_RUN_DEADLINE_MS
  const parsed = value === undefined || value.trim() === '' ? NaN : Number(value)
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_RUN_DEADLINE_MS
}

export class RunDeadlineError extends Error {
  constructor() {
    super('The run reached its time limit')
    this.name = 'RunDeadlineError'
  }
}

export function deadlinePassed(limits: RunLimits = {}, now = Date.now()) {
  return (
    Boolean(limits.abortSignal?.aborted) ||
    (limits.deadlineAt !== undefined && now >= limits.deadlineAt)
  )
}

/** A call's own timeout, shortened to the time the run has left. */
export function boundedTimeoutMs(
  limits: RunLimits = {},
  capMs: number,
  now = Date.now(),
): number {
  return limits.deadlineAt === undefined
    ? capMs
    : Math.max(1, Math.min(capMs, limits.deadlineAt - now))
}

/**
 * The timeout for one call, as boundedTimeoutMs, but throws when no time is
 * left, so the call never starts.
 */
export function callTimeoutMs(
  limits: RunLimits = {},
  capMs: number,
  now = Date.now(),
): number {
  if (deadlinePassed(limits, now)) throw new RunDeadlineError()
  return boundedTimeoutMs(limits, capMs, now)
}
