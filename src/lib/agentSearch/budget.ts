import { agentSearchScorer } from './classifier'
import {
  agentSearchScorerModelSpec,
  plannerPriceEnv,
  resolveModelPrice,
  scorerPriceEnv,
} from './model'
import type { AgentSearchRunStore } from './runStore'

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
  | { ok: false; reason: 'daily_limit' | 'run_in_progress' | 'global_budget' }

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
    staleRunMs: readLimit(
      env.AGENT_SEARCH_STALE_RUN_MS,
      DEFAULT_LIMITS.staleRunMs,
    ),
  }
}

export function startOfUtcDay(now: Date): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString()
}

/**
 * Whether this account may start another question now. Every account obeys
 * the caps, including the development preview account 'dev'. A running run
 * older than the stale window no longer blocks, so a crashed run cannot lock
 * a member out for the day.
 */
export async function checkAgentSearchBudget(
  store: Pick<AgentSearchRunStore, 'countSince' | 'hasRunning' | 'costSince'>,
  accountId: string,
  now: Date = new Date(),
): Promise<AgentSearchBudgetResult> {
  const limits = agentSearchBudgetLimits()
  const since = startOfUtcDay(now)
  const [count, running, cost] = await Promise.all([
    store.countSince(accountId, since),
    store.hasRunning(accountId, limits.staleRunMs, now),
    store.costSince(since),
  ])
  if (count >= limits.dailyLimit) return { ok: false, reason: 'daily_limit' }
  if (running) return { ok: false, reason: 'run_in_progress' }
  if (cost >= limits.globalDailyUsd) {
    return { ok: false, reason: 'global_budget' }
  }
  return { ok: true }
}
