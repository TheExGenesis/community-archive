import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/database-types'

interface TweetCountData {
  tweet_date: string
  tweet_count: number
}

type TimeGranularity = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year'

export async function getTweetCountByDate(
  supabase: SupabaseClient<Database>,
  startDate: string,
  endDate: string,
  granularity: TimeGranularity = 'day'
): Promise<TweetCountData[]> {
  // Use new get_tweet_counts_by_granularity function which supports minute and hour
  // This is more efficient as it returns counts directly from database
  const { data, error } = await supabase
    .rpc('get_tweet_counts_by_granularity', {
      start_date: startDate,
      end_date: endDate,
      granularity: granularity
    })

  if (error) {
    console.error('Error fetching tweet count data:', error)
    throw error
  }

  return data as TweetCountData[]
}

export async function getStreamedTweetCountByDate(
  supabase: SupabaseClient<Database>,
  startDate: string,
  endDate: string,
  granularity: TimeGranularity = 'day'
): Promise<TweetCountData[]> {
  // Use get_streamed_tweet_counts_by_granularity function which filters for null archive_upload_id
  // This is used by stream monitor to show only live-streamed tweets, not archive uploads
  const { data, error } = await supabase
    .rpc('get_streamed_tweet_counts_by_granularity', {
      start_date: startDate,
      end_date: endDate,
      granularity: granularity
    })

  if (error) {
    console.error('Error fetching streamed tweet count data:', error)
    throw error
  }

  return data as TweetCountData[]
}
