import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/database-types'

interface ScraperCountData {
  scraper_date: string
  unique_scrapers: number
}

type TimeGranularity = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year'

export async function getScraperCountByDate(
  supabase: SupabaseClient<Database>,
  startDate: string,
  endDate: string,
  granularity: TimeGranularity = 'day'
): Promise<ScraperCountData[]> {
  // Use new get_scraper_counts_by_granularity RPC function
  const { data, error } = await supabase
    .rpc('get_scraper_counts_by_granularity', {
      start_date: startDate,
      end_date: endDate,
      granularity: granularity
    })

  if (error) {
    console.error('Error fetching scraper count data:', error)
    throw error
  }

  return data as ScraperCountData[]
}