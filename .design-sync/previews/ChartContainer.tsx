import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from 'community-archive'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'

const tweetsByMonth = [
  { month: 'Jan', tweets: 18240 },
  { month: 'Feb', tweets: 21510 },
  { month: 'Mar', tweets: 19870 },
  { month: 'Apr', tweets: 26930 },
  { month: 'May', tweets: 31200 },
  { month: 'Jun', tweets: 28450 },
  { month: 'Jul', tweets: 35810 },
]

const tweetConfig = {
  tweets: { label: 'Tweets', color: 'hsl(var(--chart-accent))' },
}

export const AreaTrend = () => (
  <div className="w-full max-w-md">
    <ChartContainer config={tweetConfig} className="h-[200px] w-full">
      <AreaChart data={tweetsByMonth} margin={{ left: -12, right: 12, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickCount={5}
          tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
        />
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        <Area
          dataKey="tweets"
          type="natural"
          fill="var(--color-tweets)"
          fillOpacity={0.4}
          stroke="var(--color-tweets)"
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  </div>
)

const engagement = [
  { month: 'Mar', likes: 4200, replies: 1300 },
  { month: 'Apr', likes: 5100, replies: 1800 },
  { month: 'May', likes: 3900, replies: 1100 },
  { month: 'Jun', likes: 6400, replies: 2200 },
  { month: 'Jul', likes: 5800, replies: 1900 },
]

const engagementConfig = {
  likes: { label: 'Likes', color: 'hsl(var(--chart-accent))' },
  replies: { label: 'Replies', color: 'hsl(var(--muted-foreground))' },
}

export const BarsWithLegend = () => (
  <div className="w-full max-w-md">
    <ChartContainer config={engagementConfig} className="h-[200px] w-full">
      <BarChart data={engagement}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="likes" fill="var(--color-likes)" radius={4} isAnimationActive={false} />
        <Bar dataKey="replies" fill="var(--color-replies)" radius={4} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
  </div>
)

export const WithTooltip = () => (
  <div className="w-full max-w-md">
    <ChartContainer config={tweetConfig} className="h-[200px] w-full">
      <AreaChart data={tweetsByMonth} margin={{ left: 12, right: 12, top: 12 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
        <ChartTooltip
          active
          defaultIndex={4}
          cursor={false}
          content={<ChartTooltipContent indicator="line" />}
        />
        <Area
          dataKey="tweets"
          type="natural"
          fill="var(--color-tweets)"
          fillOpacity={0.4}
          stroke="var(--color-tweets)"
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  </div>
)
