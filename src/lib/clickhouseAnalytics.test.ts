import { getTopFollowedAccounts } from './clickhouseAnalytics'

describe('getTopFollowedAccounts', () => {
  const originalApiUrl = process.env.CLICKHOUSE_ANALYTICS_API_URL
  const originalApiToken = process.env.CLICKHOUSE_ANALYTICS_API_TOKEN

  beforeEach(() => {
    process.env.CLICKHOUSE_ANALYTICS_API_URL =
      'https://analytics.community-archive.org/analytics/'
    process.env.CLICKHOUSE_ANALYTICS_API_TOKEN = 'test-token'
  })

  afterEach(() => {
    jest.restoreAllMocks()
    if (originalApiUrl === undefined) {
      delete process.env.CLICKHOUSE_ANALYTICS_API_URL
    } else {
      process.env.CLICKHOUSE_ANALYTICS_API_URL = originalApiUrl
    }
    if (originalApiToken === undefined) {
      delete process.env.CLICKHOUSE_ANALYTICS_API_TOKEN
    } else {
      process.env.CLICKHOUSE_ANALYTICS_API_TOKEN = originalApiToken
    }
  })

  it('maps the membership-aware ClickHouse ranking for the homepage', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            accountId: '123',
            username: 'tszzl',
            displayName: 'tszzl',
            avatarUrl: 'https://pbs.twimg.com/profile_images/tszzl.jpg',
            followerCount: '250000',
          },
        ],
      }),
    } as Response)

    await expect(getTopFollowedAccounts(7)).resolves.toEqual([
      {
        account_id: '123',
        username: 'tszzl',
        avatar_media_url: 'https://pbs.twimg.com/profile_images/tszzl.jpg',
        num_followers: 250000,
      },
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://analytics.community-archive.org/analytics/top-followed-accounts?limit=7',
      {
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer test-token',
        },
        next: { revalidate: 86_400 },
      },
    )
  })

  it('fails closed when the server-only gateway configuration is missing', async () => {
    delete process.env.CLICKHOUSE_ANALYTICS_API_TOKEN

    await expect(getTopFollowedAccounts()).rejects.toThrow(
      'ClickHouse analytics API is not configured',
    )
  })
})
