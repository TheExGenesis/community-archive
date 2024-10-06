import CommunityStats from '@/components/CommunityStats'
import { ActivityTracker } from '@/components/activity-tracker'
import { TweetHistogramComponent } from '@/components/tweet-histogram'

import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'
import {
  subYears,
  eachDayOfInterval,
  format,
  getDay,
  startOfWeek,
  endOfWeek,
  eachMonthOfInterval,
  addDays,
  startOfDay,
} from 'date-fns'
import { DataPoint, MyAreaChart } from '@/components/ui/area-chart'

async function getTweetCountByDate() {
  const cookieStore = cookies()
  const supabase = createServerClient(cookieStore)

  const startDate = '2023-01-01'
  const endDate = '2023-12-31'

  const { data, error } = await supabase
    .schema('public')
    .rpc('get_tweet_count_by_date', {
      start_date: startDate,
      end_date: endDate,
    })

  if (error) {
    console.error('Error fetching tweet count by date:', error)
    return null
  }

  return data
}

export default async function StatsPage() {
  const tweetCountData = await getTweetCountByDate()

  // Transform the data for ActivityTracker
  const activityData =
    tweetCountData?.reduce(
      (acc, { tweet_date, tweet_count }) => {
        const formattedDate = format(new Date(tweet_date), 'yyyy-MM-dd')
        acc[formattedDate] = tweet_count
        return acc
      },
      {} as { [date: string]: number },
    ) || {}

  // Transform tweetCountData into an array of DataPoint objects
  const dataPoints: DataPoint[] =
    tweetCountData?.map(({ tweet_date, tweet_count }) => ({
      tweet_date,
      tweet_count,
    })) || []

  return (
    <div className="flex min-h-screen justify-center bg-gray-100 dark:bg-gray-900">
      <div className="w-full max-w-3xl bg-white p-8 dark:bg-gray-800">
        <h1 className="mb-6 text-3xl font-bold text-black dark:text-white">
          Community Stats
        </h1>
        <ActivityTracker data={activityData} />
        {/* {tweetCountData && <TweetHistogramComponent data={tweetCountData} />} */}
        <MyAreaChart initialData={dataPoints} />
        <CommunityStats />
      </div>
    </div>
  )
}
