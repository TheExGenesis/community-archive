import '@testing-library/jest-dom'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { BangersExplorer } from './BangersExplorer'
import type { PortalTweet } from '@/lib/portal/types'

jest.mock('./TweetRow', () => ({
  TweetRow: ({ tweet }: { tweet: PortalTweet }) => (
    <article data-testid="tweet-row">{tweet.text}</article>
  ),
}))

function tweet(
  id: string,
  text: string,
  year: number,
  quoteCount: number,
  likes: number,
  rts = 0,
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
    rts,
    quoteCount,
  }
}

const tweets = [
  tweet('1', 'Newest thought', 2026, 3, 10),
  tweet('2', 'Older favorite', 2025, 9, 100),
  tweet('3', 'Another older thought', 2025, 15, 20),
]

describe('BangersExplorer', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/bangers')
  })

  test('filters by year and sorts the remaining tweets', () => {
    render(<BangersExplorer tweets={tweets} />)

    expect(
      screen.getAllByTestId('tweet-row').map((row) => row.textContent),
    ).toEqual(['Another older thought', 'Older favorite', 'Newest thought'])

    fireEvent.change(screen.getByLabelText('Filter by year'), {
      target: { value: '2025' },
    })
    expect(screen.getByText('Showing 2 tweets from 2025')).toBeVisible()
    expect(screen.queryByText('Newest thought')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Sort bangers'), {
      target: { value: 'likes' },
    })
    expect(
      screen.getAllByTestId('tweet-row').map((row) => row.textContent),
    ).toEqual(['Older favorite', 'Another older thought'])
  })

  test('searches names and text and can clear the result', () => {
    render(<BangersExplorer tweets={tweets} />)

    fireEvent.change(screen.getByPlaceholderText('Search tweets or people…'), {
      target: { value: 'favorite' },
    })
    expect(screen.getByText('Older favorite')).toBeVisible()
    expect(screen.queryByText('Newest thought')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.getAllByTestId('tweet-row')).toHaveLength(3)
  })

  test('groups the all-years view into year columns', () => {
    render(<BangersExplorer tweets={tweets} />)

    fireEvent.click(screen.getByRole('button', { name: 'By year' }))

    const year2026 = screen.getByRole('region', { name: '2026' })
    const year2025 = screen.getByRole('region', { name: '2025' })
    expect(within(year2026).getAllByTestId('tweet-row')).toHaveLength(1)
    expect(within(year2025).getAllByTestId('tweet-row')).toHaveLength(2)
    expect(window.location.search).toBe('?view=years')
  })
})
