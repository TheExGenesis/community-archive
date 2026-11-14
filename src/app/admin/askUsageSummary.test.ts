import { summarizeAskUsage, type AskUsageRow } from './askUsageSummary'

const run = (patch: Partial<AskUsageRow>): AskUsageRow => ({
  account_id: 'a',
  started_at: '2026-11-13T10:00:00Z',
  status: 'completed',
  key_source: 'house',
  input_tokens: 1000,
  output_tokens: 100,
  cost_usd: '0.05',
  ...patch,
})

test('totals each UTC day and the month, filling days with no questions', () => {
  const usage = summarizeAskUsage(
    [
      run({}),
      run({ account_id: 'b', status: 'failed', cost_usd: 0.01 }),
      run({ key_source: 'own', cost_usd: 0 }),
      run({ started_at: '2026-11-11T23:59:59Z' }),
      // Last month: inside the window's query, outside this month's total.
      run({ started_at: '2026-10-31T12:00:00Z' }),
    ],
    new Date('2026-11-13T12:00:00Z'),
    3,
  )

  expect(usage.daily.map((day) => day.day)).toEqual([
    '2026-11-13',
    '2026-11-12',
    '2026-11-11',
  ])
  expect(usage.today).toMatchObject({
    questions: 3,
    askers: 2,
    failed: 1,
    ownKey: 1,
    inputTokens: 3000,
    outputTokens: 300,
  })
  expect(usage.today.costUsd).toBeCloseTo(0.06)
  expect(usage.daily[1].questions).toBe(0)
  expect(usage.daily[2].questions).toBe(1)
  expect(usage.month.questions).toBe(4)
  expect(usage.month.costUsd).toBeCloseTo(0.11)
})
