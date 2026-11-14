export interface AskUsageRow {
  account_id: string
  started_at: string
  status: string
  key_source: string | null
  input_tokens: number | null
  output_tokens: number | null
  cost_usd: number | string | null
}

export interface AskUsageTotals {
  questions: number
  askers: number
  failed: number
  /** Questions paid with the member's own OpenRouter key. */
  ownKey: number
  inputTokens: number
  outputTokens: number
  /** House spend: own-key planner calls add tokens but no cost. */
  costUsd: number
}

export interface AskUsageDay extends AskUsageTotals {
  /** UTC day, YYYY-MM-DD. */
  day: string
}

function totals(rows: AskUsageRow[]): AskUsageTotals {
  const askers = new Set<string>()
  const sum: AskUsageTotals = {
    questions: 0,
    askers: 0,
    failed: 0,
    ownKey: 0,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
  }
  for (const row of rows) {
    askers.add(row.account_id)
    sum.questions += 1
    if (row.status === 'failed') sum.failed += 1
    if (row.key_source === 'own') sum.ownKey += 1
    sum.inputTokens += Number(row.input_tokens) || 0
    sum.outputTokens += Number(row.output_tokens) || 0
    sum.costUsd += Number(row.cost_usd) || 0
  }
  sum.askers = askers.size
  return sum
}

const utcDay = (date: Date) => date.toISOString().slice(0, 10)

/**
 * Totals by UTC day (newest first, every day present) and for the UTC month
 * so far. Days match the budgets, which reset at UTC midnight.
 */
export function summarizeAskUsage(
  rows: AskUsageRow[],
  now: Date,
  days: number,
) {
  const byDay = new Map<string, AskUsageRow[]>()
  for (const row of rows) {
    const day = row.started_at.slice(0, 10)
    byDay.set(day, [...(byDay.get(day) ?? []), row])
  }
  const daily: AskUsageDay[] = []
  for (let back = 0; back < days; back += 1) {
    const day = utcDay(
      new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() - back,
        ),
      ),
    )
    daily.push({ day, ...totals(byDay.get(day) ?? []) })
  }
  const month = utcDay(now).slice(0, 7)
  return {
    daily,
    today: daily[0],
    month: totals(rows.filter((row) => row.started_at.startsWith(month))),
  }
}
