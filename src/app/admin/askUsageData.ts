import 'server-only'
import { agentSearchBudgetLimits } from '@/lib/agentSearch/budget'
import {
  agentSearchEnabled,
  agentSearchLaunched,
} from '@/lib/agentSearch/enabled'
import { getAdminClient } from './data'
import { summarizeAskUsage, type AskUsageRow } from './askUsageSummary'

export const ASK_USAGE_DAYS = 14
const PAGE_SIZE = 1000

/**
 * Ask the archive usage for the admin dashboard: questions, askers, tokens and
 * house spend by UTC day, from the run records that back the budgets. Reads
 * the counters only, never questions or answers.
 */
export async function loadAskUsage(now = new Date()) {
  const admin = await getAdminClient()
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  const windowStart = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - (ASK_USAGE_DAYS - 1),
  )
  const since = new Date(Math.min(monthStart, windowStart)).toISOString()

  const rows: AskUsageRow[] = []
  // PostgREST caps result sets, so page through with a stable order.
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await admin
      .from('agent_search_runs')
      .select(
        'id, account_id, started_at, status, key_source, input_tokens, output_tokens, cost_usd',
      )
      .gte('started_at', since)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...((data ?? []) as AskUsageRow[]))
    if ((data ?? []).length < PAGE_SIZE) break
  }

  return {
    ...summarizeAskUsage(rows, now, ASK_USAGE_DAYS),
    launched: agentSearchLaunched(),
    enabled: agentSearchEnabled(),
    globalDailyUsd: agentSearchBudgetLimits().globalDailyUsd,
  }
}
