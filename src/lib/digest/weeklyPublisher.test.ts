import {
  automatedWorkflowId,
  latestCompletedWeekStart,
  publishWeeklyDigest,
  type WeeklyDigestDb,
} from '../../../services/nightly-digest/publishWeekly'
import type { WeeklyDigestContent } from './weekly'

type Row = Record<string, unknown>

const WEEK = '2026-10-26'
const dates = [
  '2026-10-26',
  '2026-10-27',
  '2026-10-28',
  '2026-10-29',
  '2026-10-30',
  '2026-10-31',
  '2026-11-01',
]

const daily = (digestDate: string) => ({
  id: `daily-${digestDate}`,
  status: 'published',
  digest_date: digestDate,
  issue_number: 1,
  content: { digestDate, stories: [], executiveSummary: [] },
})

const content = {
  weekStart: WEEK,
  stories: [],
} as unknown as WeeklyDigestContent

function fakeDb(input: { dailyDates?: string[]; weekly?: Row[] } = {}) {
  const weekly: Row[] = [...(input.weekly ?? [])]
  const dailyRows = (input.dailyDates ?? dates).map(daily)
  const calls: { op: string; table: string; value?: Row }[] = []
  const matches = (row: Row, params: URLSearchParams) =>
    Array.from(params.entries()).every(([key, raw]) => {
      if (['select', 'order', 'limit', 'and'].includes(key)) return true
      if (raw.startsWith('eq.')) return String(row[key]) === raw.slice(3)
      if (raw.startsWith('in.('))
        return raw.slice(4, -1).split(',').includes(String(row[key]))
      return true
    })
  const db: WeeklyDigestDb = {
    async select<T>(table: string, params: URLSearchParams) {
      calls.push({ op: 'select', table })
      const rows = table === 'digest_editions' ? dailyRows : weekly
      return rows.filter((row) => matches(row, params)) as T[]
    },
    async insert<T>(table: string, value: Row) {
      calls.push({ op: 'insert', table, value })
      const row = { id: `weekly-${weekly.length + 1}`, ...value }
      weekly.push(row)
      return [row] as T[]
    },
    async update<T>(table: string, params: URLSearchParams, value: Row) {
      calls.push({ op: 'update', table, value })
      const updated = weekly.filter((row) => matches(row, params))
      updated.forEach((row) => Object.assign(row, value))
      return updated as T[]
    },
  }
  return { db, weekly, calls }
}

const generated = {
  content,
  attempts: [
    {
      response: { id: 'r1' },
      output: {},
      outputError: null,
      responseId: 'r1',
      model: 'anthropic/claude-opus-5.5',
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
    },
  ],
  prompt: { system: 's', user: 'u', model: 'anthropic/claude-opus-5.5' },
}

describe('publishWeeklyDigest', () => {
  it('targets the week that ended on the most recent Sunday', () => {
    expect(latestCompletedWeekStart(new Date('2026-11-02T09:00:00Z'))).toBe(
      WEEK,
    )
    expect(latestCompletedWeekStart(new Date('2026-11-08T23:00:00Z'))).toBe(
      WEEK,
    )
  })

  it('publishes a validated week with prior weekly continuity', async () => {
    const prior = {
      id: 'prior',
      week_start: '2026-10-19',
      status: 'published',
      content: { weekStart: '2026-10-19', stories: [], executiveSummary: [] },
    }
    const { db, weekly } = fakeDb({ weekly: [prior] })
    const generate = jest.fn().mockResolvedValue(generated)
    const result = await publishWeeklyDigest({ weekStart: WEEK, db, generate })
    expect(result.status).toBe('published')
    expect(generate.mock.calls[0][0].editions).toHaveLength(7)
    expect(generate.mock.calls[0][0].priorWeeks).toEqual([prior.content])
    const row = weekly.find(
      ({ workflow_run_id }) => workflow_run_id === automatedWorkflowId(WEEK),
    )
    expect(row).toMatchObject({
      status: 'published',
      content,
      input_tokens: 100,
      prior_week_edition_ids: ['prior'],
    })
    expect(row?.source_edition_ids).toHaveLength(7)
  })

  it('skips a published week without generating', async () => {
    const { db } = fakeDb({
      weekly: [{ id: 'done', week_start: WEEK, status: 'published' }],
    })
    const generate = jest.fn()
    await expect(
      publishWeeklyDigest({ weekStart: WEEK, db, generate }),
    ).resolves.toMatchObject({
      status: 'already-published',
    })
    expect(generate).not.toHaveBeenCalled()
  })

  it('stops at an earlier automated attempt instead of repeating the model call', async () => {
    const { db } = fakeDb({
      weekly: [
        {
          id: 'old',
          week_start: WEEK,
          status: 'failed',
          workflow_run_id: automatedWorkflowId(WEEK),
        },
      ],
    })
    const generate = jest.fn()
    await expect(
      publishWeeklyDigest({ weekStart: WEEK, db, generate }),
    ).rejects.toThrow('already exists with status failed')
    expect(generate).not.toHaveBeenCalled()
  })

  it('waits for Sunday and for enough daily editions', async () => {
    const generate = jest.fn()
    await expect(
      publishWeeklyDigest({
        weekStart: WEEK,
        db: fakeDb({ dailyDates: dates.slice(0, 6) }).db,
        generate,
      }),
    ).rejects.toThrow('Sunday 2026-11-01 has no published daily digest')
    await expect(
      publishWeeklyDigest({
        weekStart: WEEK,
        db: fakeDb({ dailyDates: ['2026-10-31', '2026-11-01'] }).db,
        generate,
      }),
    ).rejects.toThrow('Only 2 published daily digests')
    expect(generate).not.toHaveBeenCalled()
  })

  it('records a failed generation and rethrows', async () => {
    const { db, weekly } = fakeDb()
    const generate = jest
      .fn()
      .mockRejectedValue(new Error('validation rejected'))
    await expect(
      publishWeeklyDigest({ weekStart: WEEK, db, generate }),
    ).rejects.toThrow('validation rejected')
    expect(weekly[0]).toMatchObject({
      status: 'failed',
      error: 'validation rejected',
    })
  })

  it('writes nothing on a dry run', async () => {
    const { db, calls } = fakeDb()
    const generate = jest.fn().mockResolvedValue(generated)
    await expect(
      publishWeeklyDigest({ weekStart: WEEK, db, generate, dryRun: true }),
    ).resolves.toMatchObject({ status: 'dry-run' })
    expect(calls.filter(({ op }) => op !== 'select')).toEqual([])
  })
})
