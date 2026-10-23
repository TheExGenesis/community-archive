import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SelectionPeople from './SelectionPeople'

jest.mock('./hero.module.css', () => ({}))
let intersect: IntersectionObserverCallback
let observerRoot: Element | Document | null | undefined
const originalObserver = global.IntersectionObserver
const originalFetch = global.fetch
const fetchMock = jest.fn()
const people = (start: number, count: number) =>
  Array.from({ length: count }, (_, i) => ({
    account_id: String(start + i),
    username: `member${start + i}`,
    cell: 2,
  }))
let client: QueryClient
beforeEach(() => {
  client = new QueryClient()
  global.fetch = fetchMock as typeof fetch
  fetchMock.mockReset()
  global.IntersectionObserver = jest
    .fn()
    .mockImplementation((callback, options) => {
      intersect = callback
      observerRoot = options.root
      return { observe: jest.fn(), disconnect: jest.fn() }
    })
})
afterEach(() => client.clear())
afterAll(() => {
  global.IntersectionObserver = originalObserver
  global.fetch = originalFetch
})
function List({ cells = '2' }: { cells?: string }) {
  return (
    <QueryClientProvider client={client}>
      <SelectionPeople
        key={cells}
        cells={cells}
        preview={people(1, 6)}
        title="Meditation"
      />
    </QueryClientProvider>
  )
}
const open = () =>
  fireEvent.click(
    screen.getByRole('button', {
      name: 'View archive members in this selection',
    }),
  )
const respond = (start: number, count: number, nextOffset: number | null) => ({
  ok: true,
  json: async () => ({ people: people(start, count), nextOffset }),
})
it('fetches only on open, loads the next page at the dialog sentinel, and resets on selection changes', async () => {
  fetchMock
    .mockResolvedValueOnce(respond(1, 24, 24))
    .mockResolvedValueOnce(respond(25, 2, null))
    .mockResolvedValueOnce(respond(100, 1, null))
  const { rerender } = render(<List />)
  expect(fetchMock).not.toHaveBeenCalled()
  open()
  await screen.findByRole('link', { name: '@member24' })
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(observerRoot).toHaveAttribute('aria-label', 'Archive members')
  expect((observerRoot as Element).closest('[role="dialog"]')).not.toBeNull()
  await act(async () =>
    intersect(
      [{ isIntersecting: true }] as IntersectionObserverEntry[],
      {} as IntersectionObserver,
    ),
  )
  await screen.findByRole('link', { name: '@member26' })
  expect(fetchMock.mock.calls[1][0]).toContain('people?cells=2&offset=24')
  expect(screen.getAllByRole('link')).toHaveLength(26)
  expect(screen.getByRole('link', { name: '@member26' })).toHaveAttribute(
    'href',
    '/user/member26',
  )
  expect(
    screen.queryByRole('button', { name: 'Load more' }),
  ).not.toBeInTheDocument()
  rerender(<List cells="3,4" />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  open()
  await screen.findByRole('link', { name: '@member100' })
  expect(
    screen.queryByRole('link', { name: '@member1' }),
  ).not.toBeInTheDocument()
  expect(fetchMock.mock.calls[2][0]).toContain('cells=3,4&offset=0')
})
it('retains loaded people on a later-page error and retries only on request', async () => {
  fetchMock
    .mockResolvedValueOnce(respond(1, 1, 24))
    .mockResolvedValueOnce({ ok: false })
    .mockResolvedValueOnce(respond(25, 1, null))
  render(<List />)
  open()
  await screen.findByRole('link', { name: '@member1' })
  fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
  await screen.findByRole('button', { name: 'Retry loading more' })
  expect(screen.getByRole('link', { name: '@member1' })).toBeInTheDocument()
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading more' }))
  await screen.findByRole('link', { name: '@member25' })
  expect(fetchMock).toHaveBeenCalledTimes(3)
})
