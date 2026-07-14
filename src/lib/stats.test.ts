import { getStats } from './stats'

describe('getStats', () => {
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

    await expect(getStats(supabase as any)).resolves.toEqual({
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
