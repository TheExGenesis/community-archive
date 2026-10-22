import { ChartContainer, ChartTooltip, ChartTooltipContent } from 'community-archive'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis } from 'recharts'

const tweets = [
  { month: 'Feb', tweets: 21510 },
  { month: 'Mar', tweets: 19870 },
  { month: 'Apr', tweets: 26930 },
  { month: 'May', tweets: 31200 },
  { month: 'Jun', tweets: 28450 },
  { month: 'Jul', tweets: 35810 },
]

const engagement = [
  { month: 'Apr', likes: 5100, replies: 1800 },
  { month: 'May', likes: 3900, replies: 1100 },
  { month: 'Jun', likes: 6400, replies: 2200 },
  { month: 'Jul', likes: 5800, replies: 1900 },
]

export const DotIndicator = () => (
  <div className="w-full max-w-md">
    <ChartContainer
      config={{ tweets: { label: 'Tweets', color: 'hsl(var(--chart-accent))' } }}
      className="h-[200px] w-full"
    >
      <AreaChart data={tweets} margin={{ left: 12, right: 12, top: 12 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
        <ChartTooltip active defaultIndex={3} content={<ChartTooltipContent />} />
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

export const MultiSeries = () => (
  <div className="w-full max-w-md">
    <ChartContainer
      config={{
        likes: { label: 'Likes', color: 'hsl(var(--chart-accent))' },
        replies: { label: 'Replies', color: 'hsl(var(--muted-foreground))' },
      }}
      className="h-[200px] w-full"
    >
      <BarChart data={engagement} margin={{ top: 12 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
        <ChartTooltip active defaultIndex={2} content={<ChartTooltipContent indicator="dashed" />} />
        <Bar dataKey="likes" fill="var(--color-likes)" radius={4} isAnimationActive={false} />
        <Bar dataKey="replies" fill="var(--color-replies)" radius={4} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
  </div>
)
