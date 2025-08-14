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
  // Use the new streaming stats function via API since it requires service role
  // For now, fallback to basic query until we refactor this to use the API
  const { data, error } = await supabase
    .from('tweets')
    .select('created_at, tweet_id')
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .is('archive_upload_id', null) // Only streamed tweets

  if (error) {
    console.error('Error fetching streamed tweet count data:', error)
    throw error
  }

  // Group tweets by the specified granularity
  const grouped = new Map<string, number>()
  
  data?.forEach((tweet: any) => {
    const date = new Date(tweet.created_at)
    let groupKey: string
    
    switch (granularity) {
      case 'hour':
        groupKey = new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()).toISOString()
        break
      case 'day':
        groupKey = new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString()
        break
      case 'week':
        const weekStart = new Date(date)
        weekStart.setDate(date.getDate() - date.getDay())
        weekStart.setHours(0, 0, 0, 0)
        groupKey = weekStart.toISOString()
        break
      default:
        groupKey = new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString()
    }
    
    grouped.set(groupKey, (grouped.get(groupKey) || 0) + 1)
  })

  // Convert to expected format
  return Array.from(grouped.entries()).map(([tweet_date, tweet_count]) => ({
    tweet_date,
    tweet_count
  })).sort((a, b) => new Date(a.tweet_date).getTime() - new Date(b.tweet_date).getTime())
}
