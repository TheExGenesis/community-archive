jest.mock('server-only', () => ({}), { virtual: true })
jest.mock('next/cache', () => ({
  unstable_cache: (callback: unknown) => callback,
}))

import { getStats } from './stats'

describe('getStats', () => {
  it('uses ClickHouse corpus totals with the canonical Supabase member count', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          data: {
            memberAccounts: '500',
            totalTweets: '14345564',
            totalUserMentions: '4200000',
          },
        }),
      ),
    })
    const supabase = {
      schema: jest.fn(),
    }

    await expect(
      getStats(supabase as any, {
        clickHouseEnabled: true,
        fetchImpl: fetchImpl as any,
        clickHouseBaseUrl: 'https://stream.example/analytics',
        clickHouseToken: 'secret',
        fetchMemberCount: jest.fn().mockResolvedValue(633),
      }),
    ).resolves.toEqual({
      userCount: 633,
      tweetCount: 14_345_564,
      userMentionsCount: 4_200_000,
    })
    expect(supabase.schema).not.toHaveBeenCalled()
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL('https://stream.example/analytics/summary'),
      expect.objectContaining({
        headers: { Authorization: 'Bearer secret' },
        next: { revalidate: 60 },
      }),
    )
  })

  it('fetches the tweet summary and deduplicated participating-user count', async () => {
    const summarySingle = jest.fn().mockResolvedValue({
      data: {
        total_tweets: 13_600_000,
        total_user_mentions: 4_200_000,
      },
      error: null,
    })
    const summarySelect = jest.fn().mockReturnValue({ single: summarySingle })
    const from = jest.fn(() => ({ select: summarySelect }))
    const supabase = {
      schema: jest.fn().mockReturnValue({ from }),
    }

    await expect(
      getStats(supabase as any, {
        clickHouseEnabled: false,
        fetchMemberCount: jest.fn().mockResolvedValue(500),
      }),
    ).resolves.toEqual({
      userCount: 500,
      tweetCount: 13_600_000,
      userMentionsCount: 4_200_000,
    })
    expect(summarySelect).toHaveBeenCalledWith(
      'total_tweets, total_user_mentions',
    )
    expect(from).toHaveBeenCalledTimes(1)
  })
})
