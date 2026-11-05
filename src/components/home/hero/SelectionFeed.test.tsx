import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import SelectionFeed from './SelectionFeed'
import StoryPanel from './StoryPanel'
import { useRankedFeed } from './useRankedFeed'
import { useMapFeed } from './useMapFeed'
import type { HexSnapshot } from '@/lib/hexMap/types'
import { captureHomepageMapAction } from '@/lib/posthog'
jest.mock('@/lib/posthog', () => ({ captureHomepageMapAction: jest.fn() }))

jest.mock('./hero.module.css', () => ({}))
jest.mock('next/dynamic', () => () => () => null)
jest.mock('./StoryCard', () => ({
  __esModule: true,
  default: ({ story }: { story: { id: string } }) => <p>{story.id}</p>,
}))
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQuery: () => ({ data: undefined }),
  useQueryClient: () => ({}),
}))
jest.mock('./useMapFeed', () => ({
  ...jest.requireActual('./useMapFeed'),
  useMapFeed: jest.fn(),
  prefetchMapFeed: jest.fn(),
}))
jest.mock('./useRankedFeed', () => ({
  ...jest.requireActual('./useRankedFeed'),
  useRankedFeed: jest.fn(),
}))
const empty = {
  stories: [],
  editions: [],
  countryFallback: true,
  nextOffset: 2,
}
const load = jest.fn()
const base = {
  isPending: false,
  isError: false,
  isSuccess: true,
  isFetching: false,
  hasNextPage: true,
  isFetchingNextPage: false,
  isFetchNextPageError: false,
  fetchNextPage: load,
  refetch: jest.fn(),
}
let result: Record<string, unknown>
const noop = () => {}
let mobile = false
const originalMatchMedia = window.matchMedia
const originalIntersectionObserver = window.IntersectionObserver
const originalScrollTo = HTMLElement.prototype.scrollTo
const scrollTo = jest.fn()
const observe = jest.fn()
const originalResizeObserver = window.ResizeObserver
beforeAll(() => {
  window.matchMedia = jest.fn().mockImplementation(() => ({
    matches: mobile,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }))
  window.IntersectionObserver = jest
    .fn()
    .mockImplementation(() => ({ observe, disconnect: jest.fn() }))
  HTMLElement.prototype.scrollTo = scrollTo
  window.ResizeObserver = jest.fn().mockImplementation(() => ({
    observe: jest.fn(),
    disconnect: jest.fn(),
  }))
})
afterAll(() => {
  window.ResizeObserver = originalResizeObserver
  window.matchMedia = originalMatchMedia
  window.IntersectionObserver = originalIntersectionObserver
  HTMLElement.prototype.scrollTo = originalScrollTo
})
beforeEach(() => {
  jest.clearAllMocks()
  mobile = false
  result = { ...base, data: { pages: [empty] } }
  jest.mocked(useRankedFeed).mockReturnValue({
    ...base,
    hasNextPage: false,
    data: { pages: [] },
  } as unknown as ReturnType<typeof useRankedFeed>)
  jest.mocked(useMapFeed).mockImplementation(
    (path) =>
      (path.startsWith('stories?')
        ? result
        : {
            ...base,
            hasNextPage: false,
            data: { pages: [{ tweets: [] }] },
          }) as unknown as ReturnType<typeof useMapFeed>,
  )
})
function Feed() {
  return (
    <SelectionFeed
      snapshot={null}
      cells={[0]}
      tab="Stories"
      onOpen={noop}
      onHover={noop}
      onTweetHover={noop}
    />
  )
}
it('does not add country headings for empty pages or repeated retries; labels actual fallback content once', () => {
  const { rerender } = render(<Feed />)
  expect(screen.queryByText('From the same country')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
  expect(load).toHaveBeenCalledTimes(1)
  result = {
    ...base,
    isFetchNextPageError: true,
    data: { pages: [empty, empty] },
  }
  rerender(<Feed />)
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading more' }))
  expect(screen.queryByText('From the same country')).not.toBeInTheDocument()
  result = {
    ...base,
    hasNextPage: false,
    data: {
      pages: [
        empty,
        { ...empty, stories: [{ id: 'first' }] },
        { ...empty, stories: [{ id: 'second' }] },
      ],
    },
  }
  rerender(<Feed />)
  expect(screen.getAllByText('From the same country')).toHaveLength(1)
  expect(screen.getByText('first')).toBeInTheDocument()
  expect(screen.getByText('second')).toBeInTheDocument()
})
const snapshot = {
  cells: [{ accounts: 10, archived: 2, region: 1 }],
  regions: [{ id: 1, name: 'Test community', terms: [] }],
} as unknown as HexSnapshot
function Panel({ selected = [0] }: { selected?: number[] }) {
  const [tab, setTab] = useState('Stories')
  return (
    <StoryPanel
      snapshot={snapshot}
      coverageLive
      selected={selected}
      selectionTab={tab}
      onSelectionTab={setTab}
      onClear={noop}
      open={null}
      onOpen={noop}
      onHover={noop}
      onTweetHover={noop}
    />
  )
}

it('tracks only deliberate tab changes, not the automatic empty-digest fallback', () => {
  render(<Panel />)
  expect(screen.getByRole('tab', { name: 'Best' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  expect(captureHomepageMapAction).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('tab', { name: 'Latest' }))
  expect(captureHomepageMapAction).toHaveBeenCalledTimes(1)
  expect(captureHomepageMapAction).toHaveBeenCalledWith(
    'content_tab_selected',
    { tab: 'Latest' },
  )
  fireEvent.click(screen.getByRole('tab', { name: 'Latest' }))
  expect(captureHomepageMapAction).toHaveBeenCalledTimes(1)
})

it('limits mobile browse to the latest digest day, including cached desktop history', () => {
  const edition = (date: string, ids: string[]) => ({
    date,
    headline: `Digest for ${date}`,
    stories: ids.map((id) => ({ id })),
  })
  result = {
    ...base,
    data: {
      pages: [
        {
          ...empty,
          editions: [
            edition('2026-10-23', ['today-first', 'today-second']),
            edition('2026-10-22', ['yesterday']),
          ],
        },
        { ...empty, editions: [edition('2026-10-21', ['older'])] },
      ],
    },
  }
  mobile = true
  const { rerender } = render(<Panel selected={[]} />)
  expect(screen.getByText('today-first')).toBeInTheDocument()
  expect(screen.getByText('today-second')).toBeInTheDocument()
  expect(screen.queryByText('yesterday')).not.toBeInTheDocument()
  expect(screen.queryByText('older')).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Load more' }),
  ).not.toBeInTheDocument()
  expect(observe).not.toHaveBeenCalled()
  expect(load).not.toHaveBeenCalled()

  mobile = false
  rerender(<Panel selected={[]} />)
  expect(screen.getByText('yesterday')).toBeInTheDocument()
  expect(screen.getByText('older')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
  expect(load).toHaveBeenCalledTimes(1)

  mobile = true
  rerender(<Panel selected={[]} />)
  expect(screen.queryByText('yesterday')).not.toBeInTheDocument()
  expect(screen.queryByText('older')).not.toBeInTheDocument()
})

it('keeps the latest available digest on mobile when publication is delayed', () => {
  mobile = true
  result = {
    ...base,
    data: {
      pages: [
        {
          ...empty,
          editions: [
            {
              date: '2026-10-20',
              headline: 'Latest available edition',
              stories: [{ id: 'latest-available-story' }],
            },
          ],
        },
      ],
    },
  }
  render(<Panel selected={[]} />)
  expect(screen.getByText('latest-available-story')).toBeInTheDocument()
})
it('defaults an empty digest to Best but lets the user return to Digest', () => {
  render(<Panel />)
  expect(screen.getAllByRole('tab').map((el) => el.textContent)).toEqual([
    'Digest',
    'Best',
    'Latest',
    'Most liked',
    'Strands',
  ])
  expect(screen.getByRole('tab', { name: 'Best' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  fireEvent.click(screen.getByRole('tab', { name: 'Digest' }))
  expect(screen.getByRole('tab', { name: 'Digest' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  expect(
    screen.getByText('No stories in this area on these pages.'),
  ).toBeInTheDocument()
})
it('keeps Digest selected on a load failure instead of treating it as empty', () => {
  result = { ...base, isSuccess: false, isError: true, data: undefined }
  render(<Panel />)
  expect(screen.getByRole('tab', { name: 'Digest' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
})

it('filters Most liked by its selected range independently of Best and Latest', () => {
  render(<Panel />)
  fireEvent.change(screen.getByRole('combobox', { name: 'Best time range' }), {
    target: { value: 'month' },
  })
  fireEvent.click(screen.getByRole('tab', { name: 'Most liked' }))
  const ranges = screen.getByRole('combobox', { name: 'Most liked time range' })
  expect(ranges).toHaveValue('week')
  expect(
    screen.queryByRole('button', { name: 'How Best is calculated' }),
  ).not.toBeInTheDocument()
  for (const value of ['week', 'month', 'quarter', 'year', 'all']) {
    fireEvent.change(ranges, { target: { value } })
    expect(useRankedFeed).toHaveBeenLastCalledWith('0', value, true, 'likes')
  }
  fireEvent.click(screen.getByRole('tab', { name: 'Best' }))
  expect(screen.getByRole('combobox', { name: 'Best time range' })).toHaveValue(
    'month',
  )
  fireEvent.click(screen.getByRole('tab', { name: 'Most liked' }))
  expect(
    screen.getByRole('combobox', { name: 'Most liked time range' }),
  ).toHaveValue('all')
  fireEvent.click(screen.getByRole('tab', { name: 'Latest' }))
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  expect(useMapFeed).toHaveBeenLastCalledWith('posts?cells=0&sort=time', true)
})

it.each([true, false])(
  'uses the correct pagination root and scroll ownership (mobile: %s)',
  (isMobile) => {
    mobile = isMobile
    result = {
      ...base,
      data: { pages: [{ ...empty, stories: [{ id: 'story' }] }] },
    }
    render(<Panel />)
    expect(window.IntersectionObserver).toHaveBeenCalledWith(
      expect.any(Function),
      {
        root: isMobile ? null : screen.getByRole('complementary'),
        rootMargin: '800px',
      },
    )
    if (isMobile) expect(scrollTo).not.toHaveBeenCalled()
    else expect(scrollTo).toHaveBeenCalledWith(0, 0)
  },
)
