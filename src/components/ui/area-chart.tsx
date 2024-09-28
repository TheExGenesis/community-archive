'use client'

import { useState, useEffect } from 'react'
import { TrendingUp } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { createBrowserClient } from '@/utils/supabase'

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'

export type DataPoint = {
  tweet_date: string
  tweet_count: number
}

const chartConfig = {
  tweet_count: {
    label: 'Tweets',
    color: 'hsl(var(--chart-1))',
  },
} satisfies ChartConfig

interface MyAreaChartProps {
  initialData: DataPoint[]
}

async function getTweetCountByDate(
  startDate: string,
  endDate: string,
  granularity: string,
) {
  const supabase = createBrowserClient()
  console.log('startDate', startDate)
  const { data, error } = await supabase.rpc('get_tweet_count_by_date', {
    start_date: startDate,
    end_date: endDate,
    granularity: granularity,
  })

  if (error) {
    console.error('Error fetching tweet count by date:', error)
    return null
  }

  return data
}

export function MyAreaChart({ initialData }: MyAreaChartProps) {
  const [data, setData] = useState<DataPoint[]>(initialData)
  const [granularity, setGranularity] = useState<string>('day')

  useEffect(() => {
    const fetchData = async () => {
      const endDate = new Date().toISOString()
      const startDate = new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000,
      ).toISOString()
      const newData = await getTweetCountByDate(startDate, endDate, granularity)
      if (newData) {
        setData(newData)
      }
    }

    fetchData()
  }, [granularity])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tweet Histogram</CardTitle>
        <CardDescription>Showing tweet counts over time</CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup
          defaultValue="day"
          onValueChange={(value) => setGranularity(value)}
          className="mb-4 flex space-x-4"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="day" id="day" />
            <Label htmlFor="day">Day</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="week" id="week" />
            <Label htmlFor="week">Week</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="month" id="month" />
            <Label htmlFor="month">Month</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="year" id="year" />
            <Label htmlFor="year">Year</Label>
          </div>
        </RadioGroup>
        <ChartContainer config={chartConfig}>
          <AreaChart
            accessibilityLayer
            data={data}
            margin={{
              left: -20,
              right: 12,
            }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="tweet_date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) => new Date(value).toLocaleDateString()}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickCount={5}
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <Area
              dataKey="tweet_count"
              type="natural"
              fill="var(--color-tweet_count)"
              fillOpacity={0.4}
              stroke="var(--color-tweet_count)"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
      {/* Remove or modify CardFooter as needed */}
    </Card>
  )
}
