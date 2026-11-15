import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SelectionFeed, { AREA_SCAN_PAGES } from './SelectionFeed'
import type { HexSnapshot } from '@/lib/hexMap/types'
import type { MapStory, StoryPage } from '@/lib/hexMap/stories'

jest.mock('./hero.module.css', () => ({}))
jest.mock('next/dynamic', () => () => () => null)
jest.mock('./StoryCard', () => ({
  __esModule: true,
  default: ({ story }: { story: { id: string } }) => <p>{story.id}</p>,
}))
jest.mock('./useRankedFeed', () => ({
  useRankedFeed: () => ({ data: { pages: [] } }),
  rankedFeedRows: () => [],
}))

// Cell 0 and 1 share a region; cell 2 is elsewhere, so stories there match
// neither exactly nor by country.
const snapshot = {
  cells: [{ region: 1 }, { region: 1 }, { region: 2 }],
} as unknown as HexSnapshot
const story = (id: string, cell: number) =>
  ({ id, cells: [cell], people: [] }) as unknown as MapStory
const page = (
  offset: number,
  stories: MapStory[],
  last = false,
): StoryPage => ({
  stories: [],
  editions: [{ date: `day-${offset}`, headline: '', stories }],
  nextOffset: last ? null : offset + 2,
  located: true,
})

const originalFetch = global.fetch
const originalObserver = window.IntersectionObserver
beforeAll(() => {
  window.IntersectionObserver = jest.fn().mockImplementation(() => ({
    observe: jest.fn(),
    disconnect: jest.fn(),
  }))
  window.matchMedia = jest.fn().mockImplementation(() => ({
    matches: false,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }))
})
afterAll(() => {
  window.IntersectionObserver = originalObserver
  global.fetch = originalFetch
})

function renderFeed(pages: (offset: number) => StoryPage) {
  const fetchMock = jest.fn(async (url: string) => {
    const offset = Number(
      new URL(url, 'http://localhost').searchParams.get('offset'),
    )
    return { ok: true, json: async () => pages(offset) }
  })
  global.fetch = fetchMock as unknown as typeof fetch
  const client = new QueryClient()
  const onEmpty = jest.fn()
  render(
    <QueryClientProvider client={client}>
      <SelectionFeed
        snapshot={snapshot}
        cells={[0]}
        tab="Stories"
        onEmptyDigest={onEmpty}
        onOpen={() => {}}
        onHover={() => {}}
        onTweetHover={() => {}}
      />
    </QueryClientProvider>,
  )
  return { fetchMock, onEmpty, client }
}

it('shows a cluster’s stories from later pages without the reader clicking Load more', async () => {
  const { fetchMock, onEmpty, client } = renderFeed((offset) =>
    page(offset, offset === 6 ? [story('here', 0)] : [story('away', 2)]),
  )
  expect(await screen.findByText('here')).toBeInTheDocument()
  expect(screen.queryByText('away')).not.toBeInTheDocument()
  expect(onEmpty).not.toHaveBeenCalled()
  // Bounded: one scan round plus the one-page read-ahead.
  await waitFor(() =>
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(AREA_SCAN_PAGES),
  )
  expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(AREA_SCAN_PAGES + 1)
  expect(screen.getByRole('button', { name: 'Load more' })).toBeEnabled()
  client.clear()
})

it('falls back to Best only after the bounded scan finds nothing', async () => {
  const { fetchMock, onEmpty, client } = renderFeed((offset) =>
    page(offset, [story('away', 2)]),
  )
  expect(
    await screen.findByText('No stories in this area in recent digests.'),
  ).toBeInTheDocument()
  expect(onEmpty).toHaveBeenCalledTimes(1)
  expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(AREA_SCAN_PAGES + 1)
  client.clear()
})
