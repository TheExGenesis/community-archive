import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AdminActivityFeed } from './AdminActivityFeed'
import { loadActivityPageAction } from './activityFeedActions'
import type { ActivityEvent, ActivityPage } from './activityTypes'
jest.mock('./activityFeedActions', () => ({
  loadActivityPageAction: jest.fn(),
}))
const load = loadActivityPageAction as jest.Mock
const event = (
  id: string,
  kind: ActivityEvent['kind'] = 'opt_out',
): ActivityEvent => ({
  id,
  kind,
  occurred_at: '2026-04-04T06:32:34.603382+00:00',
  username: id,
  account_id: null,
  status: 'Opted out',
  detail: 'Currently explicitly opted out',
  reason: null,
  error: null,
  date_basis: 'opted out',
})
const initial: ActivityPage = {
  events: [event('optout:first')],
  nextCursor: { id: 'optout:first', occurred_at: event('').occurred_at },
}
let onIntersect: IntersectionObserverCallback
const disconnect = jest.fn()
beforeEach(() => {
  jest.clearAllMocks()
  global.IntersectionObserver = jest.fn().mockImplementation((callback) => {
    onIntersect = callback
    return { observe: jest.fn(), disconnect }
  })
})

test('scroll loads older rows once, preserves existing rows, and stops at the end', async () => {
  let finish!: (page: ActivityPage) => void
  load.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  render(<AdminActivityFeed initialPage={initial} />)
  act(() => {
    onIntersect(
      [{ isIntersecting: true }] as IntersectionObserverEntry[],
      {} as IntersectionObserver,
    )
    onIntersect(
      [{ isIntersecting: true }] as IntersectionObserverEntry[],
      {} as IntersectionObserver,
    )
  })
  expect(load).toHaveBeenCalledTimes(1)
  await act(async () =>
    finish({
      events: [event('optout:first'), event('optout:older')],
      nextCursor: null,
    }),
  )
  expect(screen.getAllByText('@optout:first')).toHaveLength(1)
  expect(screen.getByText('@optout:older')).toBeInTheDocument()
  expect(screen.getByText('All matching records loaded.')).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Load more' }),
  ).not.toBeInTheDocument()
})
test('failed page keeps data and cursor, pauses auto-load, and retries on request', async () => {
  load
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({
      events: [event('optout:older')],
      nextCursor: null,
    })
  render(<AdminActivityFeed initialPage={initial} />)
  fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'current list is unchanged',
  )
  expect(screen.getByText('@optout:first')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByText('@optout:older')).toBeInTheDocument()
  expect(load.mock.calls[1][0].cursor).toEqual(initial.nextCursor)
})
test('failed filter retries the requested filter from the beginning', async () => {
  load
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({
      events: [event('optout:emergentvibe')],
      nextCursor: null,
    })
  render(<AdminActivityFeed initialPage={initial} />)
  fireEvent.change(screen.getByLabelText('Account'), {
    target: { value: 'emergentvibe' },
  })
  fireEvent.change(screen.getByLabelText('Event type'), {
    target: { value: 'opt_out' },
  })
  fireEvent.submit(
    screen.getByRole('form', { name: 'Filter archive activity' }),
  )
  await screen.findByRole('alert')
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByText('@optout:emergentvibe')).toBeInTheDocument()
  expect(load).toHaveBeenLastCalledWith({
    search: 'emergentvibe',
    kind: 'opt_out',
    cursor: null,
  })
  expect(screen.queryByText('@optout:first')).not.toBeInTheDocument()
})
test('initial read failure is retryable and not labelled as empty history', async () => {
  load.mockResolvedValue({ events: [], nextCursor: null })
  render(<AdminActivityFeed initialPage={null} initialError="Unavailable" />)
  expect(
    screen.queryByText('No matching activity records.'),
  ).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await waitFor(() =>
    expect(
      screen.getByText('No matching activity records.'),
    ).toBeInTheDocument(),
  )
})
