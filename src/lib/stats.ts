import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'
import { SupabaseClient } from '@supabase/supabase-js'
import {
  fetchAnalyticsGatewayJson,
  isClickHouseReadsEnabled,
} from './clickhouseGateway'
import { fetchPortalMemberCount } from './portal/data'

interface ClickHouseSummaryResponse {
  data: {
    totalTweets: string | number
    totalUserMentions: string | number
  }
}

interface GetStatsOptions {
  clickHouseEnabled?: boolean
  fetchImpl?: typeof fetch
  clickHouseBaseUrl?: string
  clickHouseToken?: string
  fetchMemberCount?: () => Promise<number>
}

function safeCount(value: string | number, field: string): number {
  const count = Number(value)
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`ClickHouse summary returned an invalid ${field}`)
  }
  return count
}

export const getStats = async (
  supabase: SupabaseClient,
  options: GetStatsOptions = {},
) => {
  const clickHouseEnabled =
    options.clickHouseEnabled ?? isClickHouseReadsEnabled()
  const memberCountPromise = (
    options.fetchMemberCount ?? fetchPortalMemberCount
  )()

  if (clickHouseEnabled) {
    try {
      const [summary, userCount] = await Promise.all([
        fetchAnalyticsGatewayJson<ClickHouseSummaryResponse>(
          ['summary'],
          new URLSearchParams(),
          {
            fetchImpl: options.fetchImpl,
            revalidate: 60,
            baseUrl: options.clickHouseBaseUrl,
            token: options.clickHouseToken,
          },
        ),
        memberCountPromise,
      ])
      return {
        userCount,
        tweetCount: safeCount(summary.data.totalTweets, 'tweet count'),
        userMentionsCount: safeCount(
          summary.data.totalUserMentions,
          'mention count',
        ),
      }
    } catch (error) {
      console.error(
        'Failed to fetch homepage stats from ClickHouse; falling back to Supabase:',
        error,
      )
    }
  }

  const publicSchema = supabase.schema('public')
  const [summaryResult, userCount] = await Promise.all([
    publicSchema
      .from('global_activity_summary')
      .select('total_tweets, total_user_mentions')
      .single(),
    memberCountPromise,
  ])

  if (summaryResult.error) {
    console.error(
      'Error fetching global activity summary:',
      summaryResult.error,
    )
    throw summaryResult.error
  }

  return {
    userCount,
    tweetCount: summaryResult.data.total_tweets,
    userMentionsCount: summaryResult.data.total_user_mentions,
  }
}
