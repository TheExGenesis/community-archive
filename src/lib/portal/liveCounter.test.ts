import {
  estimateLiveTweetCount,
  interpolateLiveTweetCount,
  liveCounterBurstDelay,
  LIVE_COUNTER_CATCH_UP_DURATION_MS,
  liveTweetCatchUpRange,
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

  test('limits the visible catch-up to one hour of recent throughput', () => {
    expect(
      liveTweetCatchUpRange({
        totalTweets: 14_000_000,
        streamedLast24Hours: 2_400,
        generatedAt: '2026-08-07T12:00:00.000Z',
        now: Date.parse('2026-08-07T16:00:00.000Z'),
      }),
    ).toEqual({ startCount: 14_000_300, targetCount: 14_000_400 })
  })

  test('front-loads the catch-up gently over five minutes', () => {
    const input = { startCount: 14_000_000, targetCount: 14_001_000 }

    expect(interpolateLiveTweetCount({ ...input, elapsedMs: 0 })).toBe(
      14_000_000,
    )
    expect(
      interpolateLiveTweetCount({
        ...input,
        elapsedMs: LIVE_COUNTER_CATCH_UP_DURATION_MS / 5,
      }),
    ).toBe(14_000_260)
    expect(
      interpolateLiveTweetCount({
        ...input,
        elapsedMs: LIVE_COUNTER_CATCH_UP_DURATION_MS / 2,
      }),
    ).toBe(14_000_607)
    expect(
      interpolateLiveTweetCount({
        ...input,
        elapsedMs: LIVE_COUNTER_CATCH_UP_DURATION_MS,
      }),
    ).toBe(14_001_000)
  })

  test('paces updates with a deterministic uneven burst rhythm', () => {
    const delays = Array.from({ length: 8 }, (_, index) =>
      liveCounterBurstDelay(10_000, index),
    )

    expect(delays).toEqual([
      5_500, 13_500, 7_500, 17_500, 6_000, 11_500, 14_500, 4_000,
    ])
    expect(delays.reduce((sum, delay) => sum + delay, 0) / delays.length).toBe(
      10_000,
    )
  })
})
