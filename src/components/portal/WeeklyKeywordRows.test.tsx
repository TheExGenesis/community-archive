import { render, screen, within } from '@testing-library/react'
import { WeeklyKeywordRows } from './WeeklyKeywordRows'
import type { TermWeek } from '@/lib/portal/types'

const words: TermWeek[] = [
  {
    term: 'ai agents',
    lane: 'emerging',
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
    last7: 400,
    prev7: 200,
    deltaPct: 100,
    status: 'comparable',
  },
  {
    term: 'dolly',
    lane: 'falling',
    last7: 0,
    prev7: 100,
    deltaPct: -100,
    status: 'comparable',
  },
]

test('shows all groups, date-scoped phrase links, new terms, and falls to zero', () => {
  render(<WeeklyKeywordRows weekly={words} failed={false} />)
  expect(
    within(screen.getByRole('region', { name: 'Breaking out' })).getByText(
      'New',
    ),
  ).toBeVisible()
  expect(
    within(screen.getByRole('region', { name: 'Big and falling' })).getByText(
      '−100%',
    ),
  ).toBeVisible()
  expect(screen.getByText('Share change')).toBeVisible()
  expect(screen.getByText(/Through Sep 6 \(UTC\)/)).toBeVisible()
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
    screen.getByRole('img', { name: /dolly: 0 tweets/ }).firstElementChild,
  ).toHaveStyle({ width: '0%' })
})

test('renders empty groups honestly and hides stale rows on failure', () => {
  const { rerender } = render(<WeeklyKeywordRows weekly={[]} failed={false} />)
  expect(screen.getAllByText('No clear movers this week.')).toHaveLength(3)
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
