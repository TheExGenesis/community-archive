import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'
import { SupabaseClient } from '@supabase/supabase-js'
import {
  fetchAnalyticsGatewayJson,
  isClickHouseReadsEnabled,
} from './clickhouseGateway'

interface ClickHouseSummaryResponse {
  data: {
    memberAccounts: string | number
    totalTweets: string | number
    totalUserMentions: string | number
  }
}

interface GetStatsOptions {
  clickHouseEnabled?: boolean
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

export const getStats = async (
  supabase: SupabaseClient,
  options: GetStatsOptions = {},
) => {
  const clickHouseEnabled =
    options.clickHouseEnabled ?? isClickHouseReadsEnabled()

  if (clickHouseEnabled) {
    try {
      const summary =
        await fetchAnalyticsGatewayJson<ClickHouseSummaryResponse>(
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
  const [summaryResult, memberResult] = await Promise.all([
    publicSchema
      .from('global_activity_summary')
      .select('total_tweets, total_user_mentions')
      .single(),
    publicSchema
      .from('user_directory')
      .select('directory_id', { count: 'exact', head: true }),
  ])

  if (summaryResult.error) {
    console.error(
      'Error fetching global activity summary:',
      summaryResult.error,
    )
    throw summaryResult.error
  }

  if (memberResult.error) {
    console.error(
      'Error fetching participating user count:',
      memberResult.error,
    )
    throw memberResult.error
  }

  return {
    userCount: memberResult.count,
    tweetCount: summaryResult.data.total_tweets,
    userMentionsCount: summaryResult.data.total_user_mentions,
  }
}
