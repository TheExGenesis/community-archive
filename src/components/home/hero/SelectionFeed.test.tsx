import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import SelectionFeed, {
  AREA_SCAN_PAGES,
  AREA_SCAN_TARGET,
} from './SelectionFeed'
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
  useQuery: () => mockQuery,
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
let mockQuery: { data?: unknown } = { data: undefined }
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
  result = { ...base, hasNextPage: false, data: { pages: [empty] } }
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
const onEmpty = jest.fn()
function Feed() {
  return (
    <SelectionFeed
      snapshot={null}
      cells={[0]}
      tab="Stories"
      onEmptyDigest={onEmpty}
      onOpen={noop}
      onHover={noop}
      onTweetHover={noop}
    />
  )
}
const storyPage = (count: number, prefix = 'story') => ({
  ...empty,
  stories: Array.from({ length: count }, (_, i) => ({ id: `${prefix}-${i}` })),
})
it('scans further pages for the reader instead of stopping on an empty one, and labels fallback content once', () => {
  result = { ...base, data: { pages: [empty] } }
  const { rerender } = render(<Feed />)
  expect(load).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('status')).toHaveTextContent(
    'Looking for stories here…',
  )
  expect(
    screen.queryByRole('button', { name: 'Load more' }),
  ).not.toBeInTheDocument()
  expect(screen.queryByText(/No stories in this area/)).not.toBeInTheDocument()
  expect(onEmpty).not.toHaveBeenCalled()
  result = {
    ...base,
    isFetchNextPageError: true,
    data: { pages: [empty, empty] },
  }
  rerender(<Feed />)
  expect(load).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading more' }))
  expect(load).toHaveBeenCalledTimes(2)
  expect(onEmpty).not.toHaveBeenCalled()
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
  expect(onEmpty).not.toHaveBeenCalled()
})
it('keeps scanning while fewer than a screenful of stories show, then waits for the reader', () => {
  result = { ...base, data: { pages: [storyPage(2)] } }
  const { rerender } = render(<Feed />)
  expect(load).toHaveBeenCalledTimes(1)
  expect(screen.getByText('story-0')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Loading…' })).toBeDisabled()
  load.mockClear()
  result = { ...base, data: { pages: [storyPage(AREA_SCAN_TARGET)] } }
  rerender(<Feed />)
  expect(load).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
  expect(load).toHaveBeenCalledTimes(1)
})
it('bounds the scan and only then treats the area as empty', () => {
  result = {
    ...base,
    data: { pages: Array.from({ length: AREA_SCAN_PAGES }, () => empty) },
  }
  render(<Feed />)
  expect(load).not.toHaveBeenCalled()
  expect(onEmpty).toHaveBeenCalledTimes(1)
  expect(
    screen.getByText('No stories in this area in recent digests.'),
  ).toBeInTheDocument()
  // The exhausted round waits for the reader rather than auto-loading.
  expect(observe).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
  expect(load).toHaveBeenCalledTimes(1)
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

it('browses today’s leftover stories, then this week, then last week', () => {
  const today = new Date().toISOString().slice(0, 10)
  const week = (weekStart: string, soFar: boolean, title: string) => ({
    weekStart,
    weekEnd: weekStart,
    soFar,
    stories: [
      {
        id: `${weekStart}/w`,
        title,
        subtitle: '',
        href: '',
        days: [],
        stories: [],
      },
    ],
  })
  mockQuery = {
    data: {
      ...week('2026-11-16', true, 'This week story'),
      today: { date: today, stories: [{ id: 'today-leftover' }] },
      previous: week('2026-11-09', false, 'Last week story'),
      located: true,
    },
  }
  render(<Panel selected={[]} />)
  const headings = screen
    .getAllByRole('heading', { level: 2 })
    .map((h) => h.textContent)
  expect(headings).toEqual(['Today', 'This week', 'Last week'])
  expect(screen.getByText('today-leftover')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Read the day ↗' })).toHaveAttribute(
    'href',
    `/digest/${today}`,
  )
  expect(screen.getByText('Last week story')).toBeInTheDocument()
  expect(
    screen
      .getAllByRole('link', { name: 'Read it all ↗' })
      .map((a) => a.getAttribute('href')),
  ).toEqual(['/digest/week', '/digest/week/2026-11-09'])
  mockQuery = { data: undefined }
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
  expect(screen.getByText('No stories in this area yet.')).toBeInTheDocument()
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
    result = { ...base, data: { pages: [storyPage(AREA_SCAN_TARGET)] } }
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
