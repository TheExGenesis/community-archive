import { NextRequest } from 'next/server'
import { GET } from '@/app/api/scraping-stats/route'
import { fetchAnalyticsGatewayJson } from './clickhouseGateway'

jest.mock('./clickhouseGateway', () => ({
  fetchAnalyticsGatewayJson: jest.fn(),
}))

const fetchAnalyticsGatewayJsonMock =
  fetchAnalyticsGatewayJson as jest.MockedFunction<
    typeof fetchAnalyticsGatewayJson
  >

describe('ClickHouse-backed scraping stats route', () => {
  beforeEach(() => {
    fetchAnalyticsGatewayJsonMock.mockReset()
  })

  test('forwards a validated firehose range to the analytics gateway', async () => {
    fetchAnalyticsGatewayJsonMock.mockResolvedValue({
      data: [],
      summary: {
        totalTweets: 0,
        sourceMessages: 0,
        sourceCount: 0,
        avgTweetsPerPeriod: 0,
        periodsIncluded: 0,
        latestObservedAt: null,
        scope: 'firehose',
        countMode: 'unique_tweets_observed',
      },
      timing: {
        wallMs: 1,
        clickhouseMs: 1,
        rowsRead: 0,
        bytesRead: 0,
      },
    })

    const response = await GET(new NextRequest(
      'https://community-archive.org/api/scraping-stats?startDate=2026-07-20T00%3A00%3A00.000Z&endDate=2026-07-27T00%3A00%3A00.000Z&granularity=day&streamedOnly=true',
    ))

    expect(response.status).toBe(200)
    expect(fetchAnalyticsGatewayJsonMock).toHaveBeenCalledTimes(1)
    const [path, params, options] =
      fetchAnalyticsGatewayJsonMock.mock.calls[0]!
    expect(path).toEqual(['stream-stats'])
    expect(params!.toString()).toBe(
      'start=2026-07-20T00%3A00%3A00.000Z&end=2026-07-27T00%3A00%3A00.000Z&granularity=day&scope=firehose',
    )
    expect(options).toEqual({ timeoutMs: 25_000 })
  })

  test('rejects unsupported granularities before calling ClickHouse', async () => {
    const response = await GET(new NextRequest(
      'https://community-archive.org/api/scraping-stats?granularity=minute',
    ))

    expect(response.status).toBe(400)
    expect(fetchAnalyticsGatewayJsonMock).not.toHaveBeenCalled()
  })
})
