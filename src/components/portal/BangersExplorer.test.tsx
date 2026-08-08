import '@testing-library/jest-dom'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { BangersExplorer } from './BangersExplorer'
import type { PortalBangersPage, PortalTweet } from '@/lib/portal/types'

const push = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
jest.mock('./TweetRow', () => ({
  TweetRow: ({ tweet }: { tweet: PortalTweet }) => (
    <article data-testid="tweet-row">{tweet.text}</article>
  ),
}))

class IntersectionObserverMock {
  observe() {}
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

function renderExplorer(initialPage = page()) {
  return render(
    <BangersExplorer initialPage={initialPage} scope="all" sort="quotes" />,
  )
}

describe('BangersExplorer', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/bangers')
    push.mockReset()
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      writable: true,
      value: IntersectionObserverMock,
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('offers only banger-relevant ranking and author scopes', () => {
    renderExplorer()

    expect(
      screen.getAllByTestId('tweet-row').map((row) => row.textContent),
    ).toEqual(['Another older thought', 'Older favorite', 'Newest thought'])
    expect(screen.getByRole('link', { name: 'Most quoted' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: 'Most recent' })).toHaveAttribute(
      'href',
      '/bangers?sort=recent',
    )
    expect(
      screen.getByRole('link', { name: 'Archive members' }),
    ).toHaveAttribute('href', '/bangers?scope=members')
    expect(screen.queryByText('Likes')).not.toBeInTheDocument()
    expect(screen.queryByText('Reposts')).not.toBeInTheDocument()
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

  test('groups the all-years view into year columns with full totals', () => {
    renderExplorer(page(tweets, 3, 4))

    fireEvent.click(screen.getByRole('button', { name: 'By year' }))

    const year2026 = screen.getByRole('region', { name: '2026' })
    const year2025 = screen.getByRole('region', { name: '2025' })
    expect(within(year2026).getAllByTestId('tweet-row')).toHaveLength(1)
    expect(within(year2026).getByText('1 of 2 loaded')).toBeVisible()
    expect(within(year2025).getAllByTestId('tweet-row')).toHaveLength(2)
    expect(window.location.search).toBe('?view=years')
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
})
