import '@testing-library/jest-dom'
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BangersExplorer } from './BangersExplorer'
import type {
  PortalBangersPage,
  PortalBangersPeriod,
  PortalTweet,
} from '@/lib/portal/types'
import { capturePostHogEvent } from '@/lib/posthog'

const push = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
jest.mock('@/lib/posthog', () => ({
  capturePostHogEvent: jest.fn(),
}))
const mockCapturePostHogEvent = capturePostHogEvent as jest.Mock
jest.mock('@/components/TweetCard', () => ({
  __esModule: true,
  default: ({
    tweet,
    featuredRank,
  }: {
    tweet: PortalTweet
    featuredRank?: number
  }) => (
    <article data-testid="tweet-row" data-rank={featuredRank}>
      {tweet.text}
    </article>
  ),
}))

function mockViewportWidth(width: number) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: jest.fn((query: string) => {
      const minWidth = Number(query.match(/min-width: (\d+)px/)?.[1] ?? 0)
      return {
        matches: width >= minWidth,
        media: query,
        onchange: null,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        addListener: jest.fn(),
        removeListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }
    }),
  })
}

class IntersectionObserverMock {
  static instances: IntersectionObserverMock[] = []
  readonly observed: Element[] = []

  constructor(readonly callback: IntersectionObserverCallback) {
    IntersectionObserverMock.instances.push(this)
  }

  observe(target: Element) {
    this.observed.push(target)
  }
  disconnect() {}
  unobserve() {}
}

function tweet(
  id: string,
  text: string,
  year: number,
  quoteCount: number,
  likes: number,
): PortalTweet {
  return {
    id,
    username: `member_${id}`,
    name: `Member ${id}`,
    avatar: null,
    text,
    observedAt: `${year}-06-01T12:00:00.000Z`,
    createdAt: `${year}-06-01T12:00:00.000Z`,
    likes,
    rts: 0,
    quoteCount,
  }
}

const tweets = [
  tweet('3', 'Another older thought', 2025, 15, 20),
  tweet('2', 'Older favorite', 2025, 9, 100),
  tweet('1', 'Newest thought', 2026, 3, 10),
]
const masonryTweets = [
  ...tweets,
  tweet('4', 'Fourth thought', 2026, 2, 8),
  tweet('5', 'Fifth thought', 2026, 1, 7),
  tweet('6', 'Sixth thought', 2026, 1, 6),
]

function page(
  pageTweets = tweets,
  nextOffset: number | null = null,
  totalAvailable = pageTweets.length,
): PortalBangersPage {
  return {
    tweets: pageTweets,
    pagination: {
      limit: 60,
      offset: 0,
      nextOffset,
      totalAvailable,
      snapshotSize: totalAvailable,
      yearCounts: [
        { year: 2026, count: totalAvailable === 4 ? 2 : 1 },
        { year: 2025, count: 2 },
      ],
      candidateRankingTruncated: false,
    },
  }
}

function renderExplorer(initialPage = page(), period?: PortalBangersPeriod) {
  return render(
    <BangersExplorer
      initialPage={initialPage}
      scope="all"
      sort="quotes"
      currentYear={2026}
      period={period}
    />,
  )
}

describe('BangersExplorer', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/bangers')
    mockViewportWidth(1440)
    push.mockReset()
    mockCapturePostHogEvent.mockReset()
    IntersectionObserverMock.instances = []
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      writable: true,
      value: IntersectionObserverMock,
    })
    Object.defineProperties(Element.prototype, {
      hasPointerCapture: { configurable: true, value: () => false },
      setPointerCapture: { configurable: true, value: () => undefined },
      releasePointerCapture: { configurable: true, value: () => undefined },
      scrollIntoView: { configurable: true, value: () => undefined },
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('defaults to Best of all time without a separate rank control', () => {
    renderExplorer()

    const orderedMasonryItems = Array.from(
      screen
        .getByTestId('bangers-masonry')
        .querySelectorAll<HTMLElement>('[data-masonry-order]'),
    ).sort(
      (left, right) => Number(left.style.order) - Number(right.style.order),
    )
    expect(
      orderedMasonryItems.map(
        (item) => within(item).getByTestId('tweet-row').textContent,
      ),
    ).toEqual(['Another older thought', 'Older favorite', 'Newest thought'])
    expect(
      orderedMasonryItems.map(
        (item) => within(item).getByTestId('tweet-row').dataset.rank,
      ),
    ).toEqual(['1', '2', '3'])
    expect(
      screen.getByRole('heading', { name: 'Best of all time' }),
    ).toBeVisible()
    expect(screen.queryByText('Rank')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Best' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Recent' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Archive members' }),
    ).toHaveAttribute('href', '/bangers?scope=members&period=all')
    expect(
      screen.getByRole('combobox', { name: 'Filter by time' }),
    ).toHaveTextContent('All time')
    const when = screen.getByRole('combobox', { name: 'Filter by time' })
    const tweetsBy = screen.getByRole('group', { name: 'Tweets by' })
    expect(
      when.compareDocumentPosition(tweetsBy) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(screen.queryByText('Likes')).not.toBeInTheDocument()
    expect(screen.queryByText('Reposts')).not.toBeInTheDocument()
    expect(screen.getByTestId('bangers-masonry')).toHaveClass(
      'grid',
      'items-start',
      'gap-3',
      'lg:gap-4',
    )
    expect(screen.getByTestId('bangers-masonry')).toHaveStyle({
      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    })
    expect(
      within(screen.getByTestId('bangers-masonry-column-0'))
        .getAllByTestId('tweet-row')
        .map((row) => row.dataset.rank),
    ).toEqual(['1'])
    expect(
      within(screen.getByTestId('bangers-masonry-column-1'))
        .getAllByTestId('tweet-row')
        .map((row) => row.dataset.rank),
    ).toEqual(['2'])
    expect(
      within(screen.getByTestId('bangers-masonry-column-2'))
        .getAllByTestId('tweet-row')
        .map((row) => row.dataset.rank),
    ).toEqual(['3'])
    expect(
      orderedMasonryItems.map((item) => item.dataset.masonryOrder),
    ).toEqual(['1', '2', '3'])
  })

  test('distributes ranked bangers left to right in the two-column layout', () => {
    mockViewportWidth(1100)
    renderExplorer(page(masonryTweets))

    expect(screen.getByTestId('bangers-masonry')).toHaveStyle({
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    })
    expect(
      within(screen.getByTestId('bangers-masonry-column-0'))
        .getAllByTestId('tweet-row')
        .map((row) => row.dataset.rank),
    ).toEqual(['1', '3', '5'])
    expect(
      within(screen.getByTestId('bangers-masonry-column-1'))
        .getAllByTestId('tweet-row')
        .map((row) => row.dataset.rank),
    ).toEqual(['2', '4', '6'])
  })

  test('distributes ranked bangers left to right in the three-column layout', () => {
    renderExplorer(page(masonryTweets))

    expect(
      within(screen.getByTestId('bangers-masonry-column-0'))
        .getAllByTestId('tweet-row')
        .map((row) => row.dataset.rank),
    ).toEqual(['1', '4'])
    expect(
      within(screen.getByTestId('bangers-masonry-column-1'))
        .getAllByTestId('tweet-row')
        .map((row) => row.dataset.rank),
    ).toEqual(['2', '5'])
    expect(
      within(screen.getByTestId('bangers-masonry-column-2'))
        .getAllByTestId('tweet-row')
        .map((row) => row.dataset.rank),
    ).toEqual(['3', '6'])
  })

  test('keeps today selected across author links', () => {
    renderExplorer(page(), 'today')

    expect(
      screen.getByRole('combobox', { name: 'Filter by time' }),
    ).toHaveTextContent('Today')
    expect(
      screen.getByRole('link', { name: 'Archive members' }),
    ).toHaveAttribute('href', '/bangers?scope=members&period=today')
    expect(screen.getByText(/from the last 24 hours/)).toBeVisible()
  })

  test('makes the active seven-day window unmistakable', () => {
    renderExplorer(page(), 'week')

    expect(
      screen.getByRole('heading', { name: 'Best of the last 7 days' }),
    ).toBeVisible()
  })

  test('orders all time above today and offers the last three months', async () => {
    const user = userEvent.setup()
    renderExplorer(page(), 'today')

    await user.click(screen.getByRole('combobox', { name: 'Filter by time' }))

    const options = screen.getAllByRole('option')
    expect(options.slice(0, 4).map((option) => option.textContent)).toEqual([
      'All time',
      'Today',
      'Last 7 days',
      'Last 3 months',
    ])
  })

  test('shows a pending state while navigating to another time range', async () => {
    const user = userEvent.setup()
    renderExplorer()

    const timeFilter = screen.getByRole('combobox', {
      name: 'Filter by time',
    })
    await user.click(timeFilter)
    await user.click(screen.getByRole('option', { name: 'Last 7 days' }))

    expect(push).toHaveBeenCalledWith('/bangers?period=week')
    expect(screen.getByText('Loading bangers…')).toBeVisible()
    expect(timeFilter).toBeDisabled()
  })

  test('preserves modified-click behavior on author scope links', () => {
    renderExplorer()

    let defaultPreventedBeforeTestCleanup: boolean | undefined
    document.addEventListener(
      'click',
      (event) => {
        defaultPreventedBeforeTestCleanup = event.defaultPrevented
        event.preventDefault()
      },
      { once: true },
    )
    fireEvent.click(screen.getByRole('link', { name: 'Archive members' }), {
      metaKey: true,
    })

    expect(defaultPreventedBeforeTestCleanup).toBe(false)
    expect(screen.queryByText('Loading bangers…')).not.toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })

  test('shows a pending state for ordinary author scope navigation', () => {
    renderExplorer()

    document.addEventListener('click', (event) => event.preventDefault(), {
      once: true,
    })
    fireEvent.click(screen.getByRole('link', { name: 'Archive members' }))

    expect(screen.getByText('Loading bangers…')).toBeVisible()
    expect(mockCapturePostHogEvent).toHaveBeenCalledWith('bangers_action', {
      action: 'scope_changed',
      has_query: false,
      time_range: 'all',
      sort: 'quotes',
      scope: 'members',
      result_count: 3,
    })
  })

  test('searches names and text and can clear the result', () => {
    renderExplorer()

    fireEvent.change(
      screen.getByPlaceholderText('Search all ranked bangers…'),
      {
        target: { value: 'favorite' },
      },
    )
    expect(screen.getByText('Older favorite')).toBeVisible()
    expect(screen.queryByText('Newest thought')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.getAllByTestId('tweet-row')).toHaveLength(3)
  })

  test('removes the by-year view control', () => {
    renderExplorer(page(tweets, 3, 4))

    expect(
      screen.queryByRole('button', { name: 'By year' }),
    ).not.toBeInTheDocument()
    expect(screen.getByTestId('bangers-masonry')).toBeVisible()
  })

  test('loads and appends the next ranked page', async () => {
    const nextTweet = tweet('4', 'One more banger', 2026, 2, 8)
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => page([nextTweet], null, 4),
    } as Response)
    renderExplorer(page(tweets, 3, 4))

    fireEvent.click(screen.getByRole('button', { name: 'Load more bangers' }))

    await waitFor(() =>
      expect(screen.getAllByTestId('tweet-row')).toHaveLength(4),
    )
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/portal/bangers?offset=3&scope=all&sort=quotes',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(screen.getByText('All 4 matching bangers loaded.')).toBeVisible()
  })

  test('loads more when the masonry approaches its end', async () => {
    const nextTweet = tweet('4', 'Loaded from the short column', 2026, 2, 8)
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => page([nextTweet], null, 4),
    } as Response)
    renderExplorer(page(tweets, 3, 4))

    const observer = IntersectionObserverMock.instances.at(-1)
    const masonrySentinel = screen.getByTestId('bangers-load-more-sentinel')
    expect(observer?.observed).toContain(masonrySentinel)
    act(() => {
      observer?.callback(
        [
          {
            target: masonrySentinel,
            isIntersecting: true,
          } as unknown as IntersectionObserverEntry,
        ],
        observer as unknown as IntersectionObserver,
      )
    })

    await waitFor(() =>
      expect(screen.getByText('Loaded from the short column')).toBeVisible(),
    )
  })
})
