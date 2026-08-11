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

const push = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
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
    push.mockReset()
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

  test('defaults to Best of all time and orders the controls by intent', () => {
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
    expect(screen.getByRole('link', { name: 'Best' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: 'Best' })).toHaveAttribute(
      'href',
      '/bangers?period=all',
    )
    expect(screen.getByRole('link', { name: 'Recent' })).toHaveAttribute(
      'href',
      '/bangers?sort=recent&period=all',
    )
    expect(
      screen.getByRole('link', { name: 'Archive members' }),
    ).toHaveAttribute('href', '/bangers?scope=members&period=all')
    expect(
      screen.getByRole('combobox', { name: 'Filter by time' }),
    ).toHaveTextContent('All time')
    const when = screen.getByText('When')
    const rank = screen.getByText('Rank')
    const tweetsBy = screen.getByText('Tweets by')
    expect(
      when.compareDocumentPosition(rank) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      rank.compareDocumentPosition(tweetsBy) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(screen.queryByText('Likes')).not.toBeInTheDocument()
    expect(screen.queryByText('Reposts')).not.toBeInTheDocument()
    expect(screen.getByTestId('bangers-masonry')).toHaveClass(
      'flex',
      'lg:grid',
      'lg:grid-cols-2',
    )
    expect(
      within(screen.getByTestId('bangers-masonry-column-0'))
        .getAllByTestId('tweet-row')
        .map((row) => row.dataset.rank),
    ).toEqual(['1', '3'])
    expect(
      within(screen.getByTestId('bangers-masonry-column-1'))
        .getAllByTestId('tweet-row')
        .map((row) => row.dataset.rank),
    ).toEqual(['2'])
    expect(
      orderedMasonryItems.map((item) => item.dataset.masonryOrder),
    ).toEqual(['1', '2', '3'])
  })

  test('keeps today selected across ranking and author links', () => {
    renderExplorer(page(), 'today')

    expect(
      screen.getByRole('combobox', { name: 'Filter by time' }),
    ).toHaveTextContent('Today')
    expect(screen.getByRole('link', { name: 'Recent' })).toHaveAttribute(
      'href',
      '/bangers?sort=recent&period=today',
    )
    expect(
      screen.getByRole('link', { name: 'Archive members' }),
    ).toHaveAttribute('href', '/bangers?scope=members&period=today')
    expect(screen.getByText(/from the last 24 hours/)).toBeVisible()
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

  test('explains the Best ranking on hover and keyboard focus', async () => {
    const user = userEvent.setup()
    renderExplorer()

    const best = screen.getByRole('link', { name: 'Best' })
    await user.hover(best)

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      /Best means most quoted by distinct archive uploaders/i,
    )

    await user.unhover(best)
    best.focus()
    expect(await screen.findByRole('tooltip')).toBeVisible()
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

  test('loads more when either masonry column reaches its end', async () => {
    const nextTweet = tweet('4', 'Loaded from the short column', 2026, 2, 8)
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => page([nextTweet], null, 4),
    } as Response)
    renderExplorer(page(tweets, 3, 4))

    const observer = IntersectionObserverMock.instances.at(-1)
    const shortColumnSentinel = screen.getByTestId('bangers-column-sentinel-1')
    expect(observer?.observed).toContain(shortColumnSentinel)
    act(() => {
      observer?.callback(
        [
          {
            target: shortColumnSentinel,
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
