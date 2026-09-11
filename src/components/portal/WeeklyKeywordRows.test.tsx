import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WeeklyKeywordRows } from './WeeklyKeywordRows'
import type { TermWeek } from '@/lib/portal/types'

const words: TermWeek[] = [
  {
    term: 'ai agents',
    lane: 'emerging',
    currentPer100k: 2000,
    previousPer100k: 0,
    last7: 80,
    prev7: 0,
    deltaPct: null,
    status: 'new',
    sinceDate: '2026-08-31',
    untilDate: '2026-09-06',
  },
  {
    term: 'model',
    lane: 'rising',
    currentPer100k: 10000,
    previousPer100k: 5000,
    last7: 400,
    prev7: 200,
    deltaPct: 100,
    status: 'comparable',
  },
  {
    term: 'dolly',
    lane: 'falling',
    currentPer100k: 0,
    previousPer100k: 3000,
    last7: 0,
    prev7: 100,
    deltaPct: -100,
    status: 'comparable',
  },
]

test('orders one list by absolute share change, preserving new terms and falls to zero', () => {
  render(<WeeklyKeywordRows weekly={words} failed={false} />)
  expect(screen.getByText('New')).toBeVisible()
  expect(screen.getByText('−100%')).toBeVisible()
  expect(screen.getByText('Share change')).toBeVisible()
  expect(screen.queryByRole('region')).not.toBeInTheDocument()
  expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
    'model',
    'dolly',
    'ai agents',
  ])
  expect(screen.queryByText(/Through Sep 6/)).not.toBeInTheDocument()
  const href = screen
    .getByRole('link', { name: 'ai agents' })
    .getAttribute('href')!
  const query = new URL(href, 'https://example.test').searchParams
  expect(Object.fromEntries(query)).toEqual({
    q: 'ai agents',
    sinceDate: '2026-08-31',
    untilDate: '2026-09-06',
  })
  expect(
    screen.getByRole('img', { name: /dolly: 0 tweets/ }).lastElementChild,
  ).toHaveStyle({ width: '0%' })
})

test('renders empty groups honestly and hides stale rows on failure', () => {
  const { rerender } = render(<WeeklyKeywordRows weekly={[]} failed={false} />)
  expect(screen.getAllByText('No clear movers this week.')).toHaveLength(1)
  rerender(<WeeklyKeywordRows weekly={words} failed={true} />)
  expect(screen.getByRole('status')).toHaveTextContent(
    'temporarily unavailable',
  )
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
})

test('does not label the legacy watchlist as share-normalized discovery', () => {
  render(
    <WeeklyKeywordRows
      weekly={[{ ...words[1], lane: undefined }]}
      failed={false}
    />,
  )
  expect(screen.getByText('Change')).toBeVisible()
  expect(screen.queryByText('Share change')).not.toBeInTheDocument()
  expect(
    screen.queryByRole('region', { name: 'Breaking out' }),
  ).not.toBeInTheDocument()
})

test('shows previous share behind declines even when raw tweet counts increased', () => {
  render(
    <WeeklyKeywordRows
      weekly={[
        {
          ...words[1],
          last7: 500,
          prev7: 100,
          currentPer100k: 50,
          previousPer100k: 100,
          deltaPct: -50,
        },
        words[0],
      ]}
      failed={false}
    />,
  )
  const decline = screen.getByRole('img', { name: /model: 500 tweets/ })
  expect(decline).toHaveAccessibleName(
    /faded extension shows the previous week/,
  )
  expect(decline.children).toHaveLength(2)
  const previousWidth = parseFloat(
    (decline.firstElementChild as HTMLElement).style.width,
  )
  const currentWidth = parseFloat(
    (decline.lastElementChild as HTMLElement).style.width,
  )
  expect(previousWidth).toBe(5)
  expect(currentWidth).toBe(2.5)
  expect(screen.getByRole('img', { name: /ai agents:/ }).children).toHaveLength(
    1,
  )
})

test('makes the explanation available on keyboard focus', async () => {
  const user = userEvent.setup()
  render(<WeeklyKeywordRows weekly={words} failed={false} />)
  await user.tab()
  expect(
    screen.getByRole('button', { name: 'About trending terms' }),
  ).toHaveFocus()
  const tip = await screen.findByRole('tooltip')
  expect(tip).toHaveTextContent('Through Sep 6 (UTC).')
  expect(tip).toHaveTextContent('absolute change in author-weighted share')
  expect(tip).toHaveTextContent('faded extension')
})
