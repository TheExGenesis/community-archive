import { getStats } from './stats'

describe('getStats', () => {
  it('fetches the archive summary and the opted-in user count', async () => {
    const summarySingle = jest.fn().mockResolvedValue({
      data: {
        total_accounts: 337,
        total_tweets: 13_600_000,
        total_user_mentions: 4_200_000,
      },
      error: null,
    })
    const summarySelect = jest.fn().mockReturnValue({ single: summarySingle })
    const optInEq = jest.fn().mockResolvedValue({ count: 48, error: null })
    const optInSelect = jest.fn().mockReturnValue({ eq: optInEq })
    const from = jest.fn((table: string) =>
      table === 'global_activity_summary'
        ? { select: summarySelect }
        : { select: optInSelect },
    )
    const supabase = {
      schema: jest.fn().mockReturnValue({ from }),
    }

    await expect(getStats(supabase as any)).resolves.toEqual({
      accountCount: 337,
      optInCount: 48,
      tweetCount: 13_600_000,
      userMentionsCount: 4_200_000,
    })
    expect(summarySelect).toHaveBeenCalledWith(
      'total_accounts, total_tweets, total_user_mentions',
    )
    expect(optInSelect).toHaveBeenCalledWith('*', {
      count: 'exact',
      head: true,
    })
    expect(optInEq).toHaveBeenCalledWith('opted_in', true)
  })
})
