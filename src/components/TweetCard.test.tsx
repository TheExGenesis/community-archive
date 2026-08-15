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
  default: ({
    src,
    alt,
    className,
  }: {
    src: string
    alt: string
    className?: string
  }) => (
    <button
      type="button"
      data-testid="tweet-image"
      data-src={src}
      aria-label={`Enlarge ${alt.toLowerCase()}`}
      className={className}
    />
  ),
}))

const tweet: PortalTweet = {
  id: '123',
  username: 'alice',
  name: 'Alice',
  avatar: null,
  text: 'A complete tweet &amp;amp; media with &amp;gt; one encoding layer.',
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
    text: 'The complete &amp;quot;quoted&amp;quot; tweet.',
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
      screen.getByText('A complete tweet & media with > one encoding layer.'),
    ).toBeVisible()
    expect(screen.getByText('The complete "quoted" tweet.')).toBeVisible()
    expect(
      screen.getAllByTestId('tweet-image').map((image) => image.dataset.src),
    ).toEqual([
      'https://example.com/tweet.jpg',
      'https://example.com/quoted.jpg',
    ])
  })

  test('renders an archived video thumbnail as card media', () => {
    render(
      <TweetCard
        tweet={{
          ...tweet,
          media: [
            {
              url: 'https://example.com/video-thumbnail.jpg',
              type: 'video',
            },
          ],
          quotedTweet: undefined,
        }}
      />,
    )

    expect(screen.getByTestId('tweet-image')).toHaveAttribute(
      'data-src',
      'https://example.com/video-thumbnail.jpg',
    )
  })

  test.each([1, 2, 3, 4])(
    'renders %i quoted images in a keyboard-accessible compact grid',
    (imageCount) => {
      const media = Array.from({ length: imageCount }, (_, index) => ({
        url: `https://example.com/quoted-${index + 1}.jpg`,
        type: 'photo' as const,
      }))
      render(
        <TweetCard
          compact
          tweet={{
            ...tweet,
            media: [],
            quotedTweet: { ...tweet.quotedTweet!, media },
          }}
        />,
      )

      const grid = screen.getByRole('group', { name: 'Quoted tweet media' })
      expect(grid).toHaveClass(
        'grid',
        imageCount > 1 ? 'grid-cols-2' : 'grid-cols-1',
      )
      const images = screen.getAllByRole('button', {
        name: /Enlarge quoted tweet image/i,
      })
      expect(images).toHaveLength(imageCount)
      images.forEach((image) =>
        expect(image).toHaveClass(
          imageCount > 1 ? 'aspect-square' : 'aspect-video',
        ),
      )
    },
  )

  test('can summarize only the repeated quoted tweet marker', () => {
    render(<TweetCard tweet={tweet} quotedTweetDisplay="summary" />)

    expect(screen.getByText('The complete "quoted" tweet.')).toHaveClass(
      'line-clamp-3',
    )
    expect(
      screen.getAllByTestId('tweet-image').map((image) => image.dataset.src),
    ).toEqual(['https://example.com/tweet.jpg'])
    expect(screen.queryByText('8 likes')).not.toBeInTheDocument()
  })

  test('uses an unavailable tombstone when a quoted tweet cannot be shown', () => {
    render(
      <TweetCard
        tweet={{
          ...tweet,
          quotedTweet: { ...tweet.quotedTweet!, isDeleted: true },
        }}
      />,
    )

    expect(screen.getByText('Quoted tweet unavailable')).toBeVisible()
    expect(screen.queryByText('Quoted tweet deleted')).not.toBeInTheDocument()
  })

  test('can disable text clamping independently of the card layout', () => {
    render(<TweetCard tweet={tweet} compact noClamp />)

    expect(
      screen.getByText('A complete tweet & media with > one encoding layer.'),
    ).not.toHaveClass('line-clamp-2')
    expect(screen.getByText('The complete "quoted" tweet.')).not.toHaveClass(
      'line-clamp-3',
    )
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

  test('uses the same subtle neutral hover for every featured rank', () => {
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
    expect(cards[0]).toHaveClass(
      'duration-100',
      'ease-out',
      'hover:-translate-y-0.5',
      'hover:border-[#d4d4d7]/75',
      'dark:hover:border-[#404046]/80',
      'motion-reduce:hover:translate-y-0',
    )
    expect(cards[0].className).not.toMatch(/blue/)
  })

  test('supports a flat editorial treatment without changing tweet fidelity', () => {
    const { container } = render(
      <TweetCard tweet={tweet} variant="editorial" featuredRank={1} noClamp />,
    )

    const card = container.querySelector('article')
    expect(card).not.toBeNull()
    expect(card?.className).not.toMatch(
      /rounded-lg|border-zinc-200\/75|shadow-sm/,
    )
    expect(
      screen.getByText('A complete tweet & media with > one encoding layer.'),
    ).toHaveClass('whitespace-pre-wrap', '[font-family:var(--font-petrona)]')
    expect(screen.getByText('The complete "quoted" tweet.')).toBeVisible()
  })

  test('renders Pacific calendar dates consistently for editorial cards', () => {
    render(
      <TweetCard
        tweet={{
          ...tweet,
          createdAt: '2026-08-12T05:03:12.000Z',
          quotedTweet: {
            ...tweet.quotedTweet!,
            createdAt: '2026-08-12T06:30:00.000Z',
          },
        }}
        showDate
      />,
    )

    expect(screen.getAllByText(/11 Aug 2026/)).toHaveLength(2)
  })

  test('uses accessible Phosphor metrics and an optional external link', () => {
    const { container } = render(
      <TweetCard tweet={{ ...tweet, quoteCount: 12 }} showExternalLink />,
    )

    expect(screen.getByText('12 likes')).toHaveClass('sr-only')
    expect(
      screen.getByText('12 likes').parentElement?.querySelector('svg'),
    ).not.toBeNull()
    expect(screen.getByText('3 reposts')).toHaveClass('sr-only')
    expect(
      screen.getByText('3 reposts').parentElement?.querySelector('svg'),
    ).not.toBeNull()
    expect(
      screen
        .getByRole('link', {
          name: '12 archived quotes. Open tweet to see them.',
        })
        .querySelector('svg'),
    ).not.toBeNull()
    expect(container).not.toHaveTextContent(/[♥⇄✦🔁❝↗]/)
    expect(
      screen.getByRole('link', {
        name: 'View tweet on X (opens in a new tab)',
      }),
    ).toHaveAttribute('href', 'https://x.com/alice/status/123')
  })
})
