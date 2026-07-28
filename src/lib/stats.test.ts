import { getStats } from './stats'

describe('getStats', () => {
  it('uses the canonical ClickHouse summary when reads are enabled', async () => {
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
      }),
    ).resolves.toEqual({
      userCount: 500,
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
    const memberSelect = jest
      .fn()
      .mockResolvedValue({ count: 500, error: null })
    const from = jest.fn((table: string) =>
      table === 'global_activity_summary'
        ? { select: summarySelect }
        : { select: memberSelect },
    )
    const supabase = {
      schema: jest.fn().mockReturnValue({ from }),
    }

    await expect(
      getStats(supabase as any, { clickHouseEnabled: false }),
    ).resolves.toEqual({
      userCount: 500,
      tweetCount: 13_600_000,
      userMentionsCount: 4_200_000,
    })
    expect(summarySelect).toHaveBeenCalledWith(
      'total_tweets, total_user_mentions',
    )
    expect(memberSelect).toHaveBeenCalledWith('directory_id', {
      count: 'exact',
      head: true,
    })
  })
})
