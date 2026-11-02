import { agentSearchScorer } from './classifier'
import { agentSearchRunDeadlineMs } from './deadline'
import {
  agentSearchScorerModelSpec,
  plannerPriceEnv,
  resolveModelPrice,
  scorerPriceEnv,
} from './model'
import { OWN_KEY_LIMIT_MULTIPLIER, type KeySource } from './ownKey'
import type { AdmissionRequest, AgentSearchRunStore } from './runStore'

/**
 * Why no run may start with this configuration, or null when it may. Every
 * model the run pays per token for needs a valid price, or its spend would
 * count as $0 against the daily cap. Decisions is priced in code; Jev reports
 * its own cost.
 */
export function agentSearchPricingProblem(
  plannerSpec: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  try {
    if (!resolveModelPrice(plannerSpec, plannerPriceEnv(env))) {
      return `No price configured for planner model ${plannerSpec}`
    }
    if (agentSearchScorer(env) === 'llm') {
      const scorerSpec = agentSearchScorerModelSpec(
        env.AGENT_SEARCH_SCORER_MODEL,
      )
      if (!resolveModelPrice(scorerSpec, scorerPriceEnv(env))) {
        return `No price configured for scorer model ${scorerSpec}`
      }
    }
    return null
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

export type AgentSearchBudgetResult =
  | { ok: true }
  | {
      ok: false
      reason:
        | 'not_found'
        | 'daily_limit'
        | 'monthly_limit'
        | 'run_in_progress'
        | 'global_budget'
    }

export interface AgentSearchBudgetLimits {
  dailyLimit: number
  /** Questions a member may ask in a UTC month on the house key. */
  monthlyLimit: number
  globalDailyUsd: number
  staleRunMs: number
}

const DEFAULT_LIMITS: AgentSearchBudgetLimits = {
  dailyLimit: 10,
  monthlyLimit: 30,
  globalDailyUsd: 25,
  staleRunMs: 600_000,
}

const LAST_CALL_GRACE_MS = 120_000

// A malformed or negative value falls back to the default instead of
// silently disabling a cap.
function readLimit(value: string | undefined, fallback: number) {
  if (value === undefined || value.trim() === '') return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

export function agentSearchBudgetLimits(
  env: NodeJS.ProcessEnv = process.env,
): AgentSearchBudgetLimits {
  return {
    dailyLimit: readLimit(
      env.AGENT_SEARCH_DAILY_LIMIT,
      DEFAULT_LIMITS.dailyLimit,
    ),
    monthlyLimit: readLimit(
      env.AGENT_SEARCH_MONTHLY_LIMIT,
      DEFAULT_LIMITS.monthlyLimit,
    ),
    globalDailyUsd: readLimit(
      env.AGENT_SEARCH_GLOBAL_DAILY_USD,
      DEFAULT_LIMITS.globalDailyUsd,
    ),
    // A run may not stop blocking while it can still spend: never shorter
    // than the run deadline plus time for its last model call.
    staleRunMs: Math.max(
      readLimit(env.AGENT_SEARCH_STALE_RUN_MS, DEFAULT_LIMITS.staleRunMs),
      agentSearchRunDeadlineMs(env) + LAST_CALL_GRACE_MS,
    ),
  }
}

/** Questions a day for each key source: the house limit, and ten times it. */
export function agentSearchDailyLimits(
  env: NodeJS.ProcessEnv = process.env,
): Record<KeySource, number> {
  const house = agentSearchBudgetLimits(env).dailyLimit
  return { house, own: house * OWN_KEY_LIMIT_MULTIPLIER }
}

/** Questions a UTC month for each key source: the house limit, and ten times it. */
export function agentSearchMonthlyLimits(
  env: NodeJS.ProcessEnv = process.env,
): Record<KeySource, number> {
  const house = agentSearchBudgetLimits(env).monthlyLimit
  return { house, own: house * OWN_KEY_LIMIT_MULTIPLIER }
}

export { startOfUtcDay, startOfUtcMonth } from './day'

/**
 * A run still marked running that may still be writing: started within the
 * stale window, as admission counts a run in progress. An older one is a
 * run whose end was never recorded.
 */
export function isLiveRun(
  run: { status: string; startedAt: string },
  now: number = Date.now(),
  env: NodeJS.ProcessEnv = process.env,
) {
  return (
    run.status === 'running' &&
    now - Date.parse(run.startedAt) < agentSearchBudgetLimits(env).staleRunMs
  )
}

/**
 * Admits a question or says why not, and on admission stores the run as
 * running under `runId` before any workflow starts. Every account obeys the
 * caps, including the development preview account 'dev'. A question on the
 * member's own key gets ten times the daily and monthly limits; it still counts against
 * the global spend cap, since its scorer calls are on the house. A running run older
 * than the stale window no longer blocks, so a lost run cannot lock a member
 * out for the day; the start route first closes runs whose workflow ended
 * (runs.ts). Store errors propagate: the caller must refuse to start.
 */
export async function admitAgentSearchRun(
  store: Pick<AgentSearchRunStore, 'admit'>,
  request: Omit<AdmissionRequest, keyof AgentSearchBudgetLimits>,
): Promise<AgentSearchBudgetResult> {
  const limits = agentSearchBudgetLimits()
  const result = await store.admit({
    ...request,
    ...limits,
    dailyLimit: agentSearchDailyLimits()[request.keySource],
    monthlyLimit: agentSearchMonthlyLimits()[request.keySource],
  })
  return result === 'ok' ? { ok: true } : { ok: false, reason: result }
}
