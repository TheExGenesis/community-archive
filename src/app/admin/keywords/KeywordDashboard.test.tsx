import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react'
import { KeywordDashboard } from './KeywordDashboard'
const payload = {
  schemaVersion: 2,
  population: 'community_members',
  generatedAt: '2026-09-10T00:00:00Z',
  datasets: Array.from({ length: 7 }, (_, i) => ({
    through: `2026-09-0${i + 3}`,
    days: 7,
    rows: [
      ['__all_tweets__', 40000, 40000, 600, 600, 4000, 4000],
      ['navier', 100, 0, 50, 0, 60, 0],
      ['navier stokes', 90, 0, 45, 0, 55, 0],
      ['astra', 544, 58, 161, 24, 260, 33],
    ],
  })),
}
afterEach(() => jest.restoreAllMocks())
test('loads live candidates, uses approved settings, groups phrases and inspects raw counts', async () => {
  global.fetch = jest
    .fn()
    .mockResolvedValue({ ok: true, json: async () => payload })
  render(<KeywordDashboard />)
  const breakout = await screen.findByRole('region', { name: 'Breaking out' })
  expect(
    within(breakout).getByRole('button', { name: 'navier stokes' }),
  ).toBeInTheDocument()
  expect(
    within(breakout).queryByRole('button', { name: 'navier' }),
  ).not.toBeInTheDocument()
  expect(screen.getByLabelText('“Big” per 100k')).toHaveValue(150)
  expect(screen.getByLabelText('Phrase boost')).toHaveValue('200')
  expect(screen.getByLabelText('Downweight these exact terms')).toHaveValue('')
  fireEvent.click(
    within(breakout).getByRole('button', { name: 'navier stokes' }),
  )
  expect(screen.getByText('0 → 90')).toBeInTheDocument()
  expect(
    screen.getByRole('link', { name: 'Read tweets in this window →' }),
  ).toHaveAttribute(
    'href',
    '/search?q=navier+stokes&sinceDate=2026-09-03&untilDate=2026-09-09',
  )
  fireEvent.change(screen.getByLabelText('Through'), {
    target: { value: '2026-09-03' },
  })
  expect(
    screen.getByText('No earlier snapshots for this date.'),
  ).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Compare'), { target: { value: '1' } })
  await waitFor(() =>
    expect(fetch).toHaveBeenLastCalledWith(
      '/api/admin/keywords?days=1',
      expect.objectContaining({ cache: 'no-store' }),
    ),
  )
})
test('shows an explicit error with retry rather than empty trend columns', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 })
  render(<KeywordDashboard />)
  expect(await screen.findByRole('alert')).toHaveTextContent('unavailable')
  expect(
    screen.queryByRole('region', { name: 'Breaking out' }),
  ).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
})
