import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/database-types'

export async function getTweetCountByDate(
  supabase: SupabaseClient<Database>,
  startDate: string,
  endDate: string,
) {
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
