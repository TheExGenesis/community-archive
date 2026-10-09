import { agentSearchScorer } from './classifier'
import { agentSearchRunDeadlineMs } from './deadline'
import {
  agentSearchScorerModelSpec,
  plannerPriceEnv,
  resolveModelPrice,
  scorerPriceEnv,
} from './model'
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
      reason: 'not_found' | 'daily_limit' | 'run_in_progress' | 'global_budget'
    }

export interface AgentSearchBudgetLimits {
  dailyLimit: number
  globalDailyUsd: number
  staleRunMs: number
}

const DEFAULT_LIMITS: AgentSearchBudgetLimits = {
  dailyLimit: 10,
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

export { startOfUtcDay } from './day'

/**
 * Admits a question or says why not, and on admission stores the run as
 * running under `runId` before any workflow starts. Every account obeys the
 * caps, including the development preview account 'dev'. A running run older
 * than the stale window no longer blocks, so a lost run cannot lock a member
 * out for the day; the start route first closes runs whose workflow ended
 * (runs.ts). Store errors propagate: the caller must refuse to start.
 */
export async function admitAgentSearchRun(
  store: Pick<AgentSearchRunStore, 'admit'>,
  request: Omit<AdmissionRequest, keyof AgentSearchBudgetLimits>,
): Promise<AgentSearchBudgetResult> {
  const result = await store.admit({
    ...request,
    ...agentSearchBudgetLimits(),
  })
  return result === 'ok' ? { ok: true } : { ok: false, reason: result }
}
