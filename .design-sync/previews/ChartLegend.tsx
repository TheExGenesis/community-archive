import { ChartContainer, ChartLegend, ChartLegendContent } from 'community-archive'
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts'

const data = [
  { month: 'Mar', likes: 4200, replies: 1300 },
  { month: 'Apr', likes: 5100, replies: 1800 },
  { month: 'May', likes: 3900, replies: 1100 },
  { month: 'Jun', likes: 6400, replies: 2200 },
]

const config = {
  likes: { label: 'Likes', color: 'hsl(var(--chart-accent))' },
  replies: { label: 'Replies', color: 'hsl(var(--muted-foreground))' },
}

export const Bottom = () => (
  <div className="w-full max-w-md">
    <ChartContainer config={config} className="h-[200px] w-full">
      <BarChart data={data}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="likes" fill="var(--color-likes)" radius={4} isAnimationActive={false} />
        <Bar dataKey="replies" fill="var(--color-replies)" radius={4} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
  </div>
)

export const Top = () => (
  <div className="w-full max-w-md">
    <ChartContainer config={config} className="h-[200px] w-full">
      <BarChart data={data}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
        <ChartLegend verticalAlign="top" content={<ChartLegendContent verticalAlign="top" />} />
        <Bar dataKey="likes" stackId="a" fill="var(--color-likes)" isAnimationActive={false} />
        <Bar dataKey="replies" stackId="a" fill="var(--color-replies)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
  </div>
)
