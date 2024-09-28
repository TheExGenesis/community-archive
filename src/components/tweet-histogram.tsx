'use client'

import React, { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

import { ResponsiveContainer } from 'recharts'

import { format, parse, startOfWeek, startOfMonth, startOfYear } from 'date-fns'
import { MyAreaChart } from './ui/area-chart'

type DataPoint = {
  tweet_date: string
  tweet_count: number
}

type HistogramProps = {
  data: DataPoint[]
}

type Granularity = 'year' | 'month' | 'week'

export function TweetHistogramComponent({ data }: HistogramProps) {
  const [granularity, setGranularity] = useState<Granularity>('month')

  const aggregatedData = useMemo(() => {
    if (!data || data.length === 0) return []

    const aggregateMap = new Map<string, number>()

    data.forEach((item) => {
      const date = parse(item.tweet_date, 'yyyy-MM-dd', new Date())
      let key: string

      switch (granularity) {
        case 'year':
          key = format(startOfYear(date), 'yyyy')
          break
        case 'month':
          key = format(startOfMonth(date), 'yyyy-MM')
          break
        case 'week':
          key = format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd')
          break
      }

      aggregateMap.set(key, (aggregateMap.get(key) || 0) + item.tweet_count)
    })

    return Array.from(aggregateMap, ([date, count]) => ({ date, count }))
  }, [data, granularity])

  const formatXAxis = (tickItem: string) => {
    const date = parse(
      tickItem,
      granularity === 'year'
        ? 'yyyy'
        : granularity === 'month'
          ? 'yyyy-MM'
          : 'yyyy-MM-dd',
      new Date(),
    )
    try {
      switch (granularity) {
        case 'year':
          return format(date, 'yyyy')
        case 'month':
          return format(date, 'MMM yyyy')
        case 'week':
          return format(date, 'dd MMM')
      }
    } catch (error) {
      console.error('Error formatting date:', date, error)
      return 'Invalid date'
    }
  }

  if (!data || data.length === 0) {
    return <div className="p-4 text-center">No data available</div>
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Tweet Histogram</CardTitle>
        <div className="flex space-x-2">
          <Button
            variant={granularity === 'week' ? 'default' : 'outline'}
            onClick={() => setGranularity('week')}
          >
            Week
          </Button>
          <Button
            variant={granularity === 'month' ? 'default' : 'outline'}
            onClick={() => setGranularity('month')}
          >
            Month
          </Button>
          <Button
            variant={granularity === 'year' ? 'default' : 'outline'}
            onClick={() => setGranularity('year')}
          >
            Year
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <MyAreaChart initialData={data} />
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
