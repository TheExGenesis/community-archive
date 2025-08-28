'use client'

import React, { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createBrowserClient } from '@/utils/supabase'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import getLatestTweets from '@/lib/queries/getLatestTweets'
import UnifiedTweetList from '@/components/UnifiedTweetList'



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
  const [viewMode, setViewMode] = useState<'24h' | '7d' | '1y'>('24h')
  const [timeOffset, setTimeOffset] = useState(0)
  const [showStreamedOnly, setShowStreamedOnly] = useState(true)
  const [loadedTweets, setLoadedTweets] = useState<Tweet[]>([])
  const [tweetOffset, setTweetOffset] = useState(0)
  const tweetsPerPage = 20
  
  const supabase = createBrowserClient()

  // Query for scraping stats based on view mode and offset
  const { data: scrapingStats, isLoading: statsLoading, error: statsError } = useQuery({
    queryKey: ['scrapingStats', viewMode, timeOffset, showStreamedOnly],
    queryFn: async () => {
      const now = new Date()
      let startDate, endDate, granularity, periods
      
      if (viewMode === '24h') {
        periods = 24
        startDate = new Date(now.getTime() - (periods + timeOffset * periods) * 60 * 60 * 1000)
        endDate = new Date(now.getTime() - timeOffset * periods * 60 * 60 * 1000)
        granularity = 'hour'
      } else if (viewMode === '7d') {
        periods = 7
        startDate = new Date(now.getTime() - (periods + timeOffset * periods) * 24 * 60 * 60 * 1000)
        endDate = new Date(now.getTime() - timeOffset * periods * 24 * 60 * 60 * 1000)
        granularity = 'day'
      } else { // 1y
        periods = 52 // 52 weeks
        startDate = new Date(now.getTime() - (periods + timeOffset * periods) * 7 * 24 * 60 * 60 * 1000)
        endDate = new Date(now.getTime() - timeOffset * periods * 7 * 24 * 60 * 60 * 1000)
        granularity = 'week'
      }
      
      // Use the new API with custom date ranges
      const params = new URLSearchParams({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        granularity,
        streamedOnly: showStreamedOnly.toString()
      })
      
      const response = await fetch(`/api/scraping-stats?${params}`)
      if (!response.ok) {
        throw new Error('Failed to fetch scraping stats')
      }
      
      return response.json()
    },
    refetchInterval: viewMode === '24h' && timeOffset === 0 ? 300000 : 0, // Only refresh current 24h view
    staleTime: 60000 // 1 minute stale time
  })


  // Extract chart data and summary from scraping stats
  const chartData = scrapingStats?.data
  const chartLoading = statsLoading
  const chartError = statsError
  const scraperCount = scrapingStats?.summary?.uniqueScrapers || 0
  const scraperLoading = statsLoading

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
      label: showStreamedOnly ? "Tweets Streamed" : "Total Tweets",
      color: "hsl(var(--chart-1))",
    },
  }

  const formatXAxisLabel = (tickItem: string) => {
    if (viewMode === '24h') {
      const date = new Date(tickItem)
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } else if (viewMode === '7d') {
      const date = new Date(tickItem)
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
    } else {
      return tickItem // Week labels
    }
  }
  
  const handlePrevious = () => {
    setTimeOffset(prev => prev + 1)
  }
  
  const handleNext = () => {
    setTimeOffset(prev => Math.max(0, prev - 1))
  }
  
  const getTimeRangeLabel = () => {
    if (viewMode === '24h') {
      if (timeOffset === 0) return 'Last 24 Hours'
      return `${timeOffset * 24}-${(timeOffset + 1) * 24} hours ago`
    } else if (viewMode === '7d') {
      if (timeOffset === 0) return 'Last 7 Days'
      return `${timeOffset * 7}-${(timeOffset + 1) * 7} days ago`
    } else {
      if (timeOffset === 0) return 'Last Year'
      return `${timeOffset}-${timeOffset + 1} years ago`
    }
  }

  const getTotalTweets = () => {
    return scrapingStats?.summary?.totalTweets || 0
  }

  const getAverageTweetsPerPeriod = () => {
    return scrapingStats?.summary?.avgTweetsPerPeriod || 0
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
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Stream Monitor
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Real-time monitoring of tweet {showStreamedOnly ? 'streaming' : 'activity (including archives)'}
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Label htmlFor="stream-toggle" className="text-sm font-medium">
              {showStreamedOnly ? 'Streamed Only' : 'Total (All)'}
            </Label>
            <Switch
              id="stream-toggle"
              checked={showStreamedOnly}
              onCheckedChange={setShowStreamedOnly}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {showStreamedOnly ? 'Total Streamed' : 'Total Tweets'}
            </CardTitle>
            <CardDescription>
              {showStreamedOnly ? 'Streamed in time range' : 'All tweets in time range'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {getTotalTweets().toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Average per period</CardTitle>
            <CardDescription>
              {showStreamedOnly ? 'Mean streaming rate' : 'Mean tweet rate'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {getAverageTweetsPerPeriod().toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Unique Sources</CardTitle>
            <CardDescription>
              {showStreamedOnly ? 'Active streaming scrapers' : 'All data sources'}
            </CardDescription>
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
          <div className="flex items-center justify-between mb-4">
            <div>
              <CardTitle>
                {showStreamedOnly ? 'Tweet Streaming Activity' : 'Tweet Activity (All Sources)'}
              </CardTitle>
              <CardDescription>
                {getTimeRangeLabel()}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrevious}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNext}
                disabled={timeOffset === 0}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <Tabs value={viewMode} onValueChange={(v) => { setViewMode(v as any); setTimeOffset(0); }}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="24h">24 Hours</TabsTrigger>
              <TabsTrigger value="7d">7 Days</TabsTrigger>
              <TabsTrigger value="1y">1 Year</TabsTrigger>
            </TabsList>
          </Tabs>
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
                  dataKey="period_start" 
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
            Recently streamed top-level tweets (no replies) - refreshes automatically
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