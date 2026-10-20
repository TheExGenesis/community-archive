import { ChartContainer, ChartTooltip, ChartTooltipContent } from 'community-archive'
import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts'

const tweets = [
  { month: 'Feb', tweets: 21510 },
  { month: 'Mar', tweets: 19870 },
  { month: 'Apr', tweets: 26930 },
  { month: 'May', tweets: 31200 },
  { month: 'Jun', tweets: 28450 },
  { month: 'Jul', tweets: 35810 },
]

export const InContext = () => (
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
