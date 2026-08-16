import { getStats } from './stats'

describe('getStats', () => {
  it('uses the shared ClickHouse summary for public counts', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          data: {
            memberAccounts: '500',
            totalTweets: '14345564',
          },
        }),
      ),
    })

    await expect(
      getStats({
        fetchImpl: fetchImpl as any,
        clickHouseBaseUrl: 'https://stream.example/analytics',
        clickHouseToken: 'secret',
      }),
    ).resolves.toEqual({
      userCount: 500,
      tweetCount: 14_345_564,
    })
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL('https://stream.example/analytics/summary'),
      expect.objectContaining({
        headers: { Authorization: 'Bearer secret' },
        next: { revalidate: 60 },
      }),
    )
  })

  it('does not fall back to Supabase when the shared summary fails', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: jest.fn().mockResolvedValue('temporarily unavailable'),
    })

    await expect(
      getStats({
        fetchImpl: fetchImpl as any,
        clickHouseBaseUrl: 'https://stream.example/analytics',
        clickHouseToken: 'secret',
      }),
    ).rejects.toThrow('ClickHouse analytics request failed (503)')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
