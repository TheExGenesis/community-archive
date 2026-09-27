import { fetchPortalWeeklyTrends } from '@/lib/portal/analytics'
import { publishCompletedRun } from '../../../services/nightly-digest/publish'
import { AUGUST_11_MOCK_DIGEST } from './mock'

jest.mock('@/lib/portal/analytics', () => ({
  fetchPortalWeeklyTrends: jest.fn(),
}))

const content = { ...AUGUST_11_MOCK_DIGEST.content, digestDate: '2026-09-27' }
const trends = {
  sinceDate: '2026-09-20',
  untilDate: '2026-09-26',
  terms: [
    { term: 'up', tweets: 120, changePct: 10 },
    { term: 'down', tweets: 80, changePct: -20 },
  ],
}
const draft = { id: 'edition', status: 'draft', version: 1, content }
const run = {
  id: 'run',
  status: 'completed',
  digest_date: content.digestDate,
  parsed_output: content,
  events: [],
}
function database(existingDraft = false, savedTrends = false) {
  const edition = {
    ...draft,
    content: savedTrends ? { ...content, trends } : content,
  }
  return {
    select: jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(existingDraft ? [edition] : [])
      .mockResolvedValue([]),
    insert: jest.fn().mockResolvedValue([edition]),
    update: jest.fn().mockResolvedValue([edition]),
    rpc: jest.fn().mockResolvedValue({ ...edition, status: 'published' }),
  }
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2026-09-27T06:15:00Z'))
  jest.mocked(fetchPortalWeeklyTrends).mockResolvedValue(
    trends.terms.map((term) => ({
      term: term.term,
      last7: term.tweets,
      prev7: 100,
      deltaPct: term.changePct,
      status: 'comparable',
      sinceDate: trends.sinceDate,
      untilDate: trends.untilDate,
    })),
  )
})
afterEach(() => {
  jest.useRealTimers()
  jest.resetAllMocks()
})

test.each([false, true])(
  'nightly publisher freezes trends before publishing (existing draft: %s)',
  async (existing) => {
    const db = database(existing)
    await publishCompletedRun(db as never, run, content.digestDate)
    expect(db.update).toHaveBeenCalledWith(
      'digest_editions',
      expect.any(URLSearchParams),
      { content: { ...content, trends } },
    )
    expect(db.update.mock.calls[0][1].get('status')).toBe('eq.draft')
    expect(db.update.mock.invocationCallOrder[0]).toBeLessThan(
      db.rpc.mock.invocationCallOrder[0],
    )
    expect(db.rpc).toHaveBeenCalledWith('publish_digest_edition', {
      p_edition_id: 'edition',
    })
  },
)

test('a retry reuses the saved snapshot without reading live trends', async () => {
  const db = database(true, true)
  await publishCompletedRun(db as never, run, content.digestDate)
  expect(fetchPortalWeeklyTrends).not.toHaveBeenCalled()
  expect(db.update).not.toHaveBeenCalled()
  expect(db.rpc).toHaveBeenCalledTimes(1)
})

test('a mismatched window prevents publication without a snapshot', async () => {
  jest.mocked(fetchPortalWeeklyTrends).mockResolvedValue([])
  const db = database()
  await expect(
    publishCompletedRun(db as never, run, content.digestDate),
  ).rejects.toThrow('snapshot is unavailable')
  expect(db.rpc).not.toHaveBeenCalled()
})

test('a failed snapshot write prevents publication', async () => {
  const db = database()
  db.update.mockRejectedValue(new Error('write failed'))
  await expect(
    publishCompletedRun(db as never, run, content.digestDate),
  ).rejects.toThrow('write failed')
  expect(db.rpc).not.toHaveBeenCalled()
})

test('an already published edition remains untouched', async () => {
  const db = database()
  db.select.mockReset().mockResolvedValue([{ ...draft, status: 'published' }])
  await publishCompletedRun(db as never, run, content.digestDate)
  expect(fetchPortalWeeklyTrends).not.toHaveBeenCalled()
  expect(db.insert).not.toHaveBeenCalled()
  expect(db.update).not.toHaveBeenCalled()
  expect(db.rpc).not.toHaveBeenCalled()
})
