import { fetchPortalWeeklyTrends } from '@/lib/portal/analytics'
import { AUGUST_11_MOCK_DIGEST } from './mock'
import { freezeDraftDigestTrends } from './freezeTrends'

jest.mock('@/lib/portal/analytics', () => ({
  fetchPortalWeeklyTrends: jest.fn(),
}))

function adminForDate(digestDate: string) {
  const updateResult = Promise.resolve({ error: null })
  const update = jest.fn(() => ({
    eq: jest.fn(() => ({ eq: jest.fn(() => updateResult) })),
  }))
  const read = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({
      data: {
        content: { ...AUGUST_11_MOCK_DIGEST.content, digestDate },
        digest_date: digestDate,
        status: 'draft',
      },
      error: null,
    }),
    update,
  }
  return { client: { from: () => read } as never, update }
}

afterEach(() => {
  jest.useRealTimers()
  jest.clearAllMocks()
})

test('saves the matching day’s highest-volume terms in draft content', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-09-25T06:15:00Z'))
  jest.mocked(fetchPortalWeeklyTrends).mockResolvedValue([
    {
      term: 'large change',
      last7: 24,
      prev7: 1,
      deltaPct: 2057,
      status: 'comparable',
      sinceDate: '2026-09-18',
      untilDate: '2026-09-24',
    },
    {
      term: 'jev',
      last7: 178,
      prev7: 70,
      deltaPct: 267,
      status: 'comparable',
      sinceDate: '2026-09-18',
      untilDate: '2026-09-24',
    },
  ])
  const { client, update } = adminForDate('2026-09-25')
  await freezeDraftDigestTrends(client, 'edition-id')
  expect(update).toHaveBeenCalledWith({
    content: expect.objectContaining({
      trends: {
        sinceDate: '2026-09-18',
        untilDate: '2026-09-24',
        terms: [
          { term: 'jev', tweets: 178, changePct: 267 },
          { term: 'large change', tweets: 24, changePct: 2057 },
        ],
      },
    }),
  })
})

test('does not attach current trends to an older edition', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-09-25T06:15:00Z'))
  const { client, update } = adminForDate('2026-09-16')
  await freezeDraftDigestTrends(client, 'old-edition')
  expect(fetchPortalWeeklyTrends).not.toHaveBeenCalled()
  expect(update).not.toHaveBeenCalled()
})
