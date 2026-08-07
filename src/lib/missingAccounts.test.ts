import { fetchAnalyticsGatewayJson } from './clickhouseGateway'
import { getMissingAccounts, MissingAccountsResponse } from './missingAccounts'

jest.mock('./clickhouseGateway', () => ({
  fetchAnalyticsGatewayJson: jest.fn(),
}))

const fetchAnalyticsGatewayJsonMock =
  fetchAnalyticsGatewayJson as jest.MockedFunction<
    typeof fetchAnalyticsGatewayJson
  >

describe('getMissingAccounts', () => {
  test('requests the two bounded public rankings from the analytics gateway', async () => {
    const response: MissingAccountsResponse = {
      data: { needsOptIn: [], needsArchive: [] },
      query: {
        limit: 100,
        countMode: 'unique_referencing_tweets',
        includesMentions: true,
        includesReplies: true,
      },
      generatedAt: '2026-08-07T00:00:00.000Z',
      timing: {
        wallMs: 1,
        clickhouseMs: 1,
        rowsRead: 0,
        bytesRead: 0,
      },
    }
    fetchAnalyticsGatewayJsonMock.mockResolvedValue(response)

    await expect(getMissingAccounts()).resolves.toEqual(response)

    const [path, searchParams, options] =
      fetchAnalyticsGatewayJsonMock.mock.calls[0]!
    expect(path).toEqual(['missing-accounts'])
    expect(searchParams?.toString()).toBe('limit=100')
    expect(options).toEqual({ revalidate: 600, timeoutMs: 30_000 })
  })
})
