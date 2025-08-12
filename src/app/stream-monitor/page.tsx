'use client'

import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createBrowserClient } from '@/utils/supabase'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import getLatestTweets from '@/lib/queries/getLatestTweets'
import { getStreamedTweetCountByDate } from '@/lib/queries/getTweetCountByDate'
import UnifiedTweetList from '@/components/UnifiedTweetList'

type TimeRange = 'minute' | 'hour' | 'day' | 'week'

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
  const [timeRange, setTimeRange] = useState<TimeRange>('hour')
  const [loadedTweets, setLoadedTweets] = useState<Tweet[]>([])
  const [tweetOffset, setTweetOffset] = useState(0)
  const [timeOffset, setTimeOffset] = useState(0) // Number of periods to go back
  const tweetsPerPage = 20
  
  const supabase = createBrowserClient()

  // Query for tweet count data based on time range
  const { data: chartData, isLoading: chartLoading, error: chartError } = useQuery({
    queryKey: ['streamMonitorChart', timeRange, timeOffset],
    queryFn: async () => {
      const now = new Date()
      let startDate: Date
      let endDate: Date
      
      // Calculate time periods based on offset
      switch (timeRange) {
        case 'minute':
          endDate = new Date(now.getTime() - timeOffset * 60 * 60 * 1000) // Offset by hours
          startDate = new Date(endDate.getTime() - 60 * 60 * 1000) // Last hour
          break
        case 'hour':
          endDate = new Date(now.getTime() - timeOffset * 24 * 60 * 60 * 1000) // Offset by days
          startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000) // Last 24 hours
          break
        case 'day':
          endDate = new Date(now.getTime() - timeOffset * 7 * 24 * 60 * 60 * 1000) // Offset by weeks
          startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
          break
        case 'week':
          endDate = new Date(now.getTime() - timeOffset * 365 * 24 * 60 * 60 * 1000) // Offset by years
          startDate = new Date(endDate.getTime() - 365 * 24 * 60 * 60 * 1000) // Last year
          break
        default:
          endDate = new Date(now.getTime() - timeOffset * 24 * 60 * 60 * 1000)
          startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000)
      }

      // Use cached API route for slow queries (week/year views) or when there's time offset
      const shouldUseCache = timeRange === 'day' || timeRange === 'week' || timeOffset > 0
      
      if (shouldUseCache) {
        const params = new URLSearchParams({
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          granularity: timeRange,
          timeOffset: timeOffset.toString()
        })
        
        const response = await fetch(`/api/tweet-counts?${params}`)
        if (!response.ok) {
          throw new Error('Failed to fetch cached chart data')
        }
        return response.json()
      } else {
        // For real-time minute/hour views, use direct database query
        const data = await getStreamedTweetCountByDate(
          supabase,
          startDate.toISOString(),
          endDate.toISOString(),
          timeRange
        )
        return data
      }
    },
    refetchInterval: timeOffset === 0 && (timeRange === 'minute' ? 30000 : timeRange === 'hour' ? 300000 : 0), // Only auto-refresh current time
    // Increase stale time for cached queries to leverage server-side caching
    staleTime: (timeRange === 'day' || timeRange === 'week' || timeOffset > 0) ? 300000 : 0 // 5 minutes for cached data
  })

  // Query for unique scraper count for the current time period
  const { data: scraperCount, isLoading: scraperLoading } = useQuery({
    queryKey: ['uniqueScrapers', timeRange, timeOffset],
    queryFn: async () => {
      const now = new Date()
      let startDate: Date
      let endDate: Date
      
      // Use same time calculation as chart
      switch (timeRange) {
        case 'minute':
          endDate = new Date(now.getTime() - timeOffset * 60 * 60 * 1000)
          startDate = new Date(endDate.getTime() - 60 * 60 * 1000)
          break
        case 'hour':
          endDate = new Date(now.getTime() - timeOffset * 24 * 60 * 60 * 1000)
          startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000)
          break
        case 'day':
          endDate = new Date(now.getTime() - timeOffset * 7 * 24 * 60 * 60 * 1000)
          startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000)
          break
        case 'week':
          endDate = new Date(now.getTime() - timeOffset * 365 * 24 * 60 * 60 * 1000)
          startDate = new Date(endDate.getTime() - 365 * 24 * 60 * 60 * 1000)
          break
        default:
          endDate = new Date(now.getTime() - timeOffset * 24 * 60 * 60 * 1000)
          startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000)
      }

      return getTotalUniqueScrapers(startDate.toISOString(), endDate.toISOString())
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
    switch (timeRange) {
      case 'minute':
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      case 'hour':
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      case 'day':
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
      case 'week':
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
      default:
        return tickItem
    }
  }

  const getTotalTweets = () => {
    return chartData?.reduce((sum, item) => sum + item.tweet_count, 0) || 0
  }

  const getAverageTweetsPerPeriod = () => {
    if (!chartData?.length) return 0
    return Math.round(getTotalTweets() / chartData.length)
  }

  const loadMoreTweets = () => {
    setTweetOffset(prev => prev + tweetsPerPage)
  }

  const refreshLatestTweets = async () => {
    setTweetOffset(0)
    await refetchTweets()
  }


  const goBackInTime = () => {
    setTimeOffset(prev => prev + 1)
  }

  const goForwardInTime = () => {
    setTimeOffset(prev => Math.max(0, prev - 1))
  }

  const resetToNow = () => {
    setTimeOffset(0)
  }

  const getTimeRangeDescription = () => {
    if (timeOffset === 0) {
      switch (timeRange) {
        case 'minute': return 'Current hour'
        case 'hour': return 'Current day'
        case 'day': return 'Current week'
        case 'week': return 'Current year'
        default: return 'Current period'
      }
    } else {
      const periods = ['hour', 'day', 'week', 'year']
      const periodIndex = ['minute', 'hour', 'day', 'week'].indexOf(timeRange)
      const period = periods[periodIndex] || 'period'
      return `${timeOffset} ${period}${timeOffset > 1 ? 's' : ''} ago`
    }
  }

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          Stream Monitor
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Real-time monitoring of tweet streaming activity and latest tweets
        </p>
      </div>

      <Tabs value={timeRange} onValueChange={(value) => {
        setTimeRange(value as TimeRange)
        setTimeOffset(0) // Reset to current time when switching ranges
      }} className="mb-8">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="minute">Last Hour (by minute)</TabsTrigger>
          <TabsTrigger value="hour">Last Day (by hour)</TabsTrigger>
          <TabsTrigger value="day">Last Week (by day)</TabsTrigger>
          <TabsTrigger value="week">Last Year (by week)</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
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
            <CardTitle className="text-base">Average per {timeRange}</CardTitle>
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
            <CardTitle className="text-base">Data Points</CardTitle>
            <CardDescription>Chart resolution</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {chartData?.length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span>Tweet Streaming Activity</span>
              {scraperLoading ? (
                <span className="text-sm text-muted-foreground">Loading scrapers...</span>
              ) : (
                <span className="text-sm text-muted-foreground">
                  {scraperCount || 0} unique scrapers in this {timeRange === 'minute' ? 'hour' : timeRange === 'hour' ? 'day' : timeRange === 'day' ? 'week' : 'year'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={goBackInTime}
                disabled={chartLoading}
              >
                ←
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={resetToNow}
                disabled={chartLoading || timeOffset === 0}
              >
                Now
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={goForwardInTime}
                disabled={chartLoading || timeOffset === 0}
              >
                →
              </Button>
            </div>
          </CardTitle>
          <CardDescription>
            {getTimeRangeDescription()} - Navigate with arrows to view historical data
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
              <BarChart data={chartData || []}>
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