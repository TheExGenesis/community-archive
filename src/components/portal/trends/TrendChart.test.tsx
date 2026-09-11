import { render, screen } from '@testing-library/react'
import { TrendChart } from './TrendChart'

const props = {
  buckets: ['2026-01', '2026-02', '2026-03'],
  enabledSeries: [
    {
      term: 'astra',
      color: '#0088cc',
      tweetsPerBucket: [0, 10, 10000],
      perBucket: [0, 1, 1000],
    },
  ],
  granularity: 'month' as const,
  scale: 'raw' as const,
  selectedRange: null,
  setSelectedRange: jest.fn(),
  isLoadingSeries: false,
  seriesCount: 1,
  captureExplorerAction: jest.fn(),
  onSelectingRangeChange: jest.fn(),
}

test('log axis reveals small values, keeps zero finite, and preserves actual count labels', () => {
  const { rerender } = render(<TrendChart {...props} axis="linear" />)
  const points = () =>
    Array.from(screen.getByRole('img').querySelectorAll('circle'))
  const linearY = Number(points()[1].getAttribute('cy'))
  const zeroY = points()[0].getAttribute('cy')
  rerender(<TrendChart {...props} axis="log" />)
  expect(Number(points()[1].getAttribute('cy'))).toBeLessThan(linearY - 50)
  expect(points()[0].getAttribute('cy')).toBe(zeroY)
  expect(
    points().every((point) =>
      Number.isFinite(Number(point.getAttribute('cy'))),
    ),
  ).toBe(true)
  expect(points()[1]).toHaveAttribute(
    'aria-label',
    'astra · Feb 2026 · 10 tweets',
  )
  rerender(<TrendChart {...props} axis="log" scale="normalized" />)
  expect(points()[1]).toHaveAttribute(
    'aria-label',
    'astra · Feb 2026 · 1 per 100k',
  )
})

test('zooms to the selected window, rescales both axes, and clips the tweet selection to visible dates', () => {
  const { rerender } = render(
    <TrendChart
      {...props}
      chartRange={{ start: '2026-01', end: '2026-02' }}
      selectedRange={{ start: '2025-12', end: '2026-01' }}
    />,
  )
  const svg = screen.getByRole('img')
  const points = svg.querySelectorAll('circle')
  expect(points).toHaveLength(2)
  expect(points[0]).toHaveAttribute('cx', '62')
  expect(points[1]).toHaveAttribute('cx', '732')
  expect(points[1]).toHaveAttribute('cy', '24')
  expect(svg.querySelector('rect.pointer-events-none')).toBeInTheDocument()
  expect(props.setSelectedRange).not.toHaveBeenCalled()
  rerender(
    <TrendChart {...props} chartRange={{ start: '2026-02', end: '2026-02' }} />,
  )
  expect(svg.querySelector('circle')).toHaveAttribute('cx', '397')
  rerender(<TrendChart {...props} />)
  expect(svg.querySelectorAll('circle')).toHaveLength(3)
})
