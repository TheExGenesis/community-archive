import { fetchAnalyticsGatewayJson } from './clickhouseGateway'

interface ClickHouseSummaryResponse {
  data: {
    memberAccounts: string | number
    totalTweets: string | number
  }
}

interface GetStatsOptions {
  fetchImpl?: typeof fetch
  clickHouseBaseUrl?: string
  clickHouseToken?: string
}

function safeCount(value: string | number, field: string): number {
  const count = Number(value)
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`ClickHouse summary returned an invalid ${field}`)
  }
  return count
}

export const getStats = async (options: GetStatsOptions = {}) => {
  const summary = await fetchAnalyticsGatewayJson<ClickHouseSummaryResponse>(
    ['summary'],
    new URLSearchParams(),
    {
      fetchImpl: options.fetchImpl,
      revalidate: 60,
      baseUrl: options.clickHouseBaseUrl,
      token: options.clickHouseToken,
    },
  )
  return {
    userCount: safeCount(summary.data.memberAccounts, 'member count'),
    tweetCount: safeCount(summary.data.totalTweets, 'tweet count'),
  }
}
