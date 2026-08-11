import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import TweetCard from './TweetCard'
import type { PortalTweet } from '@/lib/portal/types'

const push = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))
jest.mock('@/components/TweetAvatarImage', () => ({
  __esModule: true,
  default: () => null,
}))
jest.mock('@/components/ImageLightbox', () => ({
  __esModule: true,
  default: ({ src, alt }: { src: string; alt: string }) => (
    <span data-testid="tweet-image" data-src={src} aria-label={alt} />
  ),
}))

const tweet: PortalTweet = {
  id: '123',
  username: 'alice',
  name: 'Alice',
  avatar: null,
  text: 'A complete tweet with media and a quote.',
  observedAt: '2026-08-10T12:00:00.000Z',
  createdAt: '2026-08-10T12:00:00.000Z',
  likes: 12,
  rts: 3,
  media: [{ url: 'https://example.com/tweet.jpg', type: 'photo' }],
  quotedTweet: {
    id: '122',
    username: 'bob',
    name: 'Bob',
    avatar: null,
    text: 'The complete quoted tweet.',
    createdAt: '2026-08-09T12:00:00.000Z',
    likes: 8,
    rts: 2,
    media: [{ url: 'https://example.com/quoted.jpg', type: 'photo' }],
  },
}

describe('TweetCard', () => {
  beforeEach(() => push.mockReset())

  test('renders tweet media and the complete quoted tweet', () => {
    render(<TweetCard tweet={tweet} />)

    expect(
      screen.getByText('A complete tweet with media and a quote.'),
    ).toBeVisible()
    expect(screen.getByText('The complete quoted tweet.')).toBeVisible()
    expect(
      screen.getAllByTestId('tweet-image').map((image) => image.dataset.src),
    ).toEqual([
      'https://example.com/tweet.jpg',
      'https://example.com/quoted.jpg',
    ])
  })

  test('makes the card clickable while preserving its origin', () => {
    const { container } = render(
      <TweetCard
        tweet={tweet}
        clickable
        origin="bangers"
        returnTo="/bangers?period=today"
      />,
    )

    const card = container.querySelector('article')
    expect(card).not.toBeNull()
    if (!card) return
    fireEvent.click(card)
    expect(push).toHaveBeenCalledWith(
      '/tweets/123?from=bangers&returnTo=%2Fbangers%3Fperiod%3Dtoday',
    )

    fireEvent.keyDown(card, { key: 'Enter' })
    expect(push).toHaveBeenCalledTimes(2)
  })

  test('uses the same light neutral outline for every featured rank', () => {
    const { container } = render(
      <>
        <TweetCard tweet={tweet} featuredRank={1} />
        <TweetCard tweet={{ ...tweet, id: '124' }} featuredRank={4} />
      </>,
    )
    const cards = Array.from(container.querySelectorAll('article'))

    expect(cards).toHaveLength(2)
    expect(cards[0].className).toBe(cards[1].className)
    expect(cards[0]).toHaveClass('border-zinc-200/75')
    expect(cards[0].className).not.toMatch(/blue|translate|hover:border/)
  })
})
