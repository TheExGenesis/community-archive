import { render, screen } from '@testing-library/react'
import { ChartContainer, ChartTooltipContent } from './chart'

jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) =>
    children,
  Tooltip: () => null,
}))

test('renders a zero count in the same numeric column as nonzero chart values', () => {
  render(
    <ChartContainer config={{ tweets: { label: 'Tweets' } }}>
      <ChartTooltipContent
        active
        payload={[{ name: 'tweets', dataKey: 'tweets', value: 0, payload: {} }]}
      />
    </ChartContainer>,
  )
  expect(screen.getByText('0')).toHaveClass('tabular-nums')
})
