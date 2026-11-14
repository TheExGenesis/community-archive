import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ASK_USAGE_DAYS, loadAskUsage } from './askUsageData'
import type { AskUsageTotals } from './askUsageSummary'

const count = (value: number) => value.toLocaleString('en-US')
const usd = (value: number) =>
  `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const tokens = (value: number) =>
  value >= 1_000_000
    ? `${(value / 1_000_000).toFixed(1)}M`
    : value >= 1_000
      ? `${Math.round(value / 1_000)}K`
      : String(value)

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  )
}

const cells = (row: AskUsageTotals) => [
  count(row.questions),
  count(row.askers),
  count(row.failed),
  count(row.ownKey),
  tokens(row.inputTokens),
  tokens(row.outputTokens),
  usd(row.costUsd),
]

export async function AskUsageSection() {
  let usage
  try {
    usage = await loadAskUsage()
  } catch {
    return (
      <Card id="ask-usage">
        <CardHeader>
          <CardTitle>Ask the archive usage</CardTitle>
        </CardHeader>
        <CardContent>
          <p role="alert">Usage could not be loaded. Refresh to try again.</p>
        </CardContent>
      </Card>
    )
  }
  const { daily, today, month, launched, enabled, globalDailyUsd } = usage
  return (
    <Card id="ask-usage">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Ask the archive usage</CardTitle>
          <Badge variant="secondary">
            {!launched ? 'Admins only' : enabled ? 'Live' : 'Paused'}
          </Badge>
        </div>
        <CardDescription>
          Questions, tokens and house spend from the run records, by UTC day.
          New questions stop for the day once house spend reaches{' '}
          {usd(globalDailyUsd)}. Own-key questions add tokens but no planner
          cost.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="Spent today"
            value={`${usd(today.costUsd)} of ${usd(globalDailyUsd)}`}
          />
          <Stat label="Questions today" value={count(today.questions)} />
          <Stat label="Spent this month" value={usd(month.costUsd)} />
          <Stat
            label="This month"
            value={`${count(month.questions)} questions · ${count(month.askers)} askers`}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm tabular-nums">
            <caption className="sr-only">
              Ask the archive usage for the last {ASK_USAGE_DAYS} days
            </caption>
            <thead className="text-xs text-muted-foreground">
              <tr>
                {[
                  'Day (UTC)',
                  'Questions',
                  'Askers',
                  'Failed',
                  'Own key',
                  'Input tokens',
                  'Output tokens',
                  'House spend',
                ].map((heading) => (
                  <th key={heading} scope="col" className="px-2 py-1.5">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {daily.map((row) => (
                <tr
                  key={row.day}
                  className={`border-t ${row.questions ? '' : 'text-muted-foreground'}`}
                >
                  <th scope="row" className="px-2 py-1.5 font-normal">
                    {row.day}
                  </th>
                  {cells(row).map((cell, index) => (
                    <td key={index} className="px-2 py-1.5">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
