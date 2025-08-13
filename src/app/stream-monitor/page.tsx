'use client'

import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createBrowserClient } from '@/utils/supabase'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import getLatestTweets from '@/lib/queries/getLatestTweets'
import UnifiedTweetList from '@/components/UnifiedTweetList'

// Get total unique scrapers for the period using server-side API
async function getTotalUniqueScrapers(startDate: string, endDate: string) {
  const params = new URLSearchParams({
    startDate,
    endDate
  })
  
  const response = await fetch(`/api/scraper-count?${params}`)
  if (!response.ok) {
    console.error('Failed to fetch scraper count')
    return 0
  }
  
  const data = await response.json()
  return data.count || 0
}


interface TweetMedia {
  media_url: string
  media_type: string
}

interface TweetUrl {
  expanded_url: string | null
  display_url: string
}

interface Tweet {
  tweet_id: string
  account_id: string
  created_at: string
  full_text: string
  retweet_count: number
  favorite_count: number
  reply_to_tweet_id: string | null
  quote_tweet_id: string | null
  retweeted_tweet_id: string | null
  avatar_media_url: string | null
  username: string
  account_display_name: string
  media: TweetMedia[]
  urls: TweetUrl[]
}

const StreamMonitor = () => {
  // Fixed to hour view only
  const [loadedTweets, setLoadedTweets] = useState<Tweet[]>([])
  const [tweetOffset, setTweetOffset] = useState(0)
  const tweetsPerPage = 20
  
  const supabase = createBrowserClient()

  // Query for tweet count data - simplified to last 24 hours only
  const { data: chartData, isLoading: chartLoading, error: chartError } = useQuery({
    queryKey: ['streamMonitorChart'],
    queryFn: async () => {
      const now = new Date()
      const startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000) // Last 24 hours
      
      // Use the simplified function directly
      const { data, error } = await supabase
        .rpc('get_simple_streamed_tweet_counts', {
          start_date: startDate.toISOString(),
          end_date: now.toISOString(),
          granularity: 'hour'
        })
      
      if (error) {
        throw new Error('Failed to fetch chart data: ' + error.message)
      }
      
      return data
    },
    refetchInterval: 300000, // Refresh every 5 minutes
    staleTime: 60000 // 1 minute stale time
  })

  // Query for unique scraper count for the last 24 hours
  const { data: scraperCount, isLoading: scraperLoading } = useQuery({
    queryKey: ['uniqueScrapers'],
    queryFn: async () => {
      const now = new Date()
      const startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000) // Last 24 hours
      return getTotalUniqueScrapers(startDate.toISOString(), now.toISOString())
    },
    staleTime: 300000 // Cache for 5 minutes
  })

  // Query for latest tweets with pagination
  const { data: tweetsData, isLoading: tweetsLoading, error: tweetsError, refetch: refetchTweets } = useQuery({
    queryKey: ['streamMonitorTweets', tweetOffset],
    queryFn: async () => {
      return await getLatestTweets(supabase, tweetsPerPage, undefined, tweetOffset)
    },
    refetchInterval: tweetOffset === 0 ? 60000 : 0 // Only auto-refresh latest tweets
  })

  // Update loaded tweets when new data arrives
  React.useEffect(() => {
    if (tweetsData) {
      if (tweetOffset === 0) {
        // Fresh load or refresh - replace all tweets
        setLoadedTweets(tweetsData)
      } else {
        // Load more - append to existing tweets
        setLoadedTweets(prev => [...prev, ...tweetsData])
      }
    }
  }, [tweetsData, tweetOffset])

  const chartConfig = {
    tweet_count: {
      label: "Tweets Streamed",
      color: "hsl(var(--chart-1))",
    },
  }

  const formatXAxisLabel = (tickItem: string) => {
    const date = new Date(tickItem)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const getTotalTweets = () => {
    if (!Array.isArray(chartData)) return 0
    return chartData.reduce((sum: number, item: { tweet_count: number }) => sum + item.tweet_count, 0)
  }

  const getAverageTweetsPerPeriod = () => {
    if (!Array.isArray(chartData) || chartData.length === 0) return 0
    return Math.round(getTotalTweets() / chartData.length)
  }

  const loadMoreTweets = () => {
    setTweetOffset(prev => prev + tweetsPerPage)
  }

  const refreshLatestTweets = async () => {
    setTweetOffset(0)
    await refetchTweets()
  }

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          Stream Monitor
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Real-time monitoring of tweet streaming activity over the last 24 hours
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Total Streamed</CardTitle>
            <CardDescription>In selected time range</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {getTotalTweets().toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Average per hour</CardTitle>
            <CardDescription>Mean streaming rate</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {getAverageTweetsPerPeriod().toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Unique Scrapers</CardTitle>
            <CardDescription>Number of distinct data sources</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {scraperLoading ? '...' : (scraperCount || 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Tweet Streaming Activity - Last 24 Hours</CardTitle>
          <CardDescription>
            Real-time tweet streaming data updated every 5 minutes
          </CardDescription>
        </CardHeader>
        <CardContent>
          {chartLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : chartError ? (
            <div className="flex items-center justify-center h-64 text-red-600 dark:text-red-400">
              Error loading chart data
            </div>
          ) : (
            <ChartContainer config={chartConfig}>
              <BarChart data={Array.isArray(chartData) ? chartData : []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="tweet_date" 
                  tickFormatter={formatXAxisLabel}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar 
                  dataKey="tweet_count" 
                  fill="hsl(var(--foreground))" 
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Latest Tweets
            <Button 
              onClick={refreshLatestTweets}
              variant="outline"
              size="sm"
              disabled={tweetsLoading}
            >
              {tweetsLoading ? 'Refreshing...' : 'Refresh'}
            </Button>
          </CardTitle>
          <CardDescription>
            Recently streamed tweets - refreshes automatically
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tweetsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : tweetsError ? (
            <div className="flex items-center justify-center py-8 text-red-600 dark:text-red-400">
              Error loading tweets
            </div>
          ) : (
            <>
              <UnifiedTweetList 
                tweets={loadedTweets}
                isLoading={false}
                emptyMessage="No tweets available"
                showCsvExport={true}
                csvFilename="stream_monitor_tweets.csv"
              />
              
              {loadedTweets.length > 0 && (
                <div className="flex justify-center pt-4">
                  <Button 
                    onClick={loadMoreTweets}
                    variant="outline"
                    disabled={tweetsLoading}
                  >
                    {tweetsLoading ? 'Loading...' : 'Load More'}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default StreamMonitor