import {
  estimateLiveTweetCount,
  liveCounterRefreshInterval,
  PORTAL_STREAM_POLL_INTERVAL_MS,
} from '@/components/portal/live'

describe('portal live updates', () => {
  test('projects the archive total at the average rate from the last 24 hours', () => {
    expect(
      estimateLiveTweetCount({
        totalTweets: 14_000_000,
        streamedLast24Hours: 8_640,
        generatedAt: '2026-08-07T12:00:00.000Z',
        now: Date.parse('2026-08-07T13:00:00.000Z'),
      }),
    ).toBe(14_000_360)
  })

  test('does not project backward or beyond one day of recent activity', () => {
    const input = {
      totalTweets: 14_000_000,
      streamedLast24Hours: 2_400,
      generatedAt: '2026-08-07T12:00:00.000Z',
    }

    expect(
      estimateLiveTweetCount({
        ...input,
        now: Date.parse('2026-08-07T11:00:00.000Z'),
      }),
    ).toBe(14_000_000)
    expect(
      estimateLiveTweetCount({
        ...input,
        now: Date.parse('2026-08-09T12:00:00.000Z'),
      }),
    ).toBe(14_002_400)
  })

  test('checks the counter no less than once a minute when activity exists', () => {
    expect(liveCounterRefreshInterval(0)).toBeNull()
    expect(liveCounterRefreshInterval(24)).toBe(PORTAL_STREAM_POLL_INTERVAL_MS)
    expect(liveCounterRefreshInterval(8_640)).toBe(10_000)
    expect(liveCounterRefreshInterval(864_000)).toBe(1_000)
  })
})
