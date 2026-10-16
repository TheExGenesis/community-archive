import { capturePostHogEvent } from '@/lib/posthog'
import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import TweetComponent from './TweetComponent'
import type { TweetData } from '@/lib/tweets/types'

jest.mock('@/lib/posthog', () => ({ capturePostHogEvent: jest.fn() }))

jest.mock('@/components/TweetAvatarImage', () => ({
  __esModule: true,
  default: () => null,
}))
jest.mock('@/components/ImageLightbox', () => ({
  __esModule: true,
  default: ({
    alt,
    gallery,
    index,
  }: {
    alt: string
    gallery?: { src: string }[]
    index?: number
  }) => (
    <span
      data-testid="lightbox"
      aria-label={alt}
      data-index={index}
      data-gallery={gallery?.map((image) => image.src).join(' ')}
    />
  ),
}))

const tweet: TweetData = {
  tweet_id: '123',
  account_id: '456',
  created_at: '2026-08-12T12:00:00.000Z',
  full_text: 'A tweet',
  retweet_count: 2,
  favorite_count: 3,
  reply_to_tweet_id: null,
  quote_tweet_id: null,
  retweeted_tweet_id: null,
  avatar_media_url: null,
  username: 'alice',
  account_display_name: 'Alice',
  media: [],
  urls: [],
}

describe('TweetComponent', () => {
  test('removes its self-link and shows an icon-only external link on a permalink page', () => {
    render(<TweetComponent tweet={tweet} isPermalinkPage />)

    expect(screen.queryByText('Archive')).not.toBeInTheDocument()
    expect(screen.queryByText('Twitter')).not.toBeInTheDocument()
    expect(
      screen.getByRole('link', {
        name: 'View on Twitter (opens in a new tab)',
      }),
    ).toHaveAttribute('href', 'https://twitter.com/alice/status/123')
  })

  test.each([false, true])(
    'lets every thumbnail step through all of a tweet’s images (compact=%s)',
    (compact) => {
      const media = [1, 2, 3, 4, 5].map((n) => ({
        media_url: `https://example.com/${n}.jpg`,
        media_type: n === 5 ? 'video' : 'photo',
      }))
      render(
        <TweetComponent
          tweet={{
            ...tweet,
            media: [
              ...media,
              { media_url: 'https://example.com/x.gif', media_type: 'gif' },
            ],
            quote_tweet_id: '789',
            quoted_tweet: {
              tweet_id: '789',
              account_id: '987',
              created_at: '2026-08-11T12:00:00.000Z',
              full_text: 'Quoted',
              retweet_count: 0,
              favorite_count: 0,
              username: 'bob',
              account_display_name: 'Bob',
              media: media.slice(0, 2),
            },
          }}
          compact={compact}
        />,
      )

      const tweetThumbs = screen.getAllByLabelText(/^Tweet image/)
      // Compact rows show four thumbnails, but the gallery still reaches the fifth.
      expect(tweetThumbs).toHaveLength(compact ? 4 : 5)
      tweetThumbs.forEach((thumb, index) => {
        expect(thumb).toHaveAttribute('data-index', String(index))
        expect(thumb).toHaveAttribute(
          'data-gallery',
          media.map((item) => item.media_url).join(' '),
        )
      })
      const quotedThumbs = screen.getAllByLabelText(/^Quoted tweet image/)
      expect(quotedThumbs).toHaveLength(2)
      expect(quotedThumbs[1]).toHaveAttribute('data-index', '1')
      expect(quotedThumbs[1]).toHaveAttribute(
        'data-gallery',
        'https://example.com/1.jpg https://example.com/2.jpg',
      )
    },
  )

  test('labels missing quoted tweets as unavailable', () => {
    render(
      <TweetComponent
        tweet={{
          ...tweet,
          quote_tweet_id: '789',
          quoted_tweet: {
            tweet_id: '789',
            account_id: '987',
            created_at: '2026-08-11T12:00:00.000Z',
            full_text: '',
            retweet_count: 0,
            favorite_count: 0,
            username: 'bob',
            account_display_name: 'Bob',
            is_deleted: true,
          },
        }}
      />,
    )

    expect(screen.getByText('[Quoted tweet unavailable]')).toBeVisible()
  })
})

test('keeps an unknown-author label for a normalized tweet with empty identity', () => {
  render(
    <TweetComponent
      tweet={{ ...tweet, username: '', account_display_name: '' }}
    />,
  )
  expect(screen.getAllByText('Unknown').length).toBeGreaterThan(0)
})

it.each([true, false])(
  'records search result opens in compact=%s without tweet contents',
  (compact) => {
    jest.clearAllMocks()
    render(
      <TweetComponent
        tweet={tweet}
        compact={compact}
        permalinkOrigin="search"
      />,
    )
    const links = screen.getAllByRole('link', {
      name: compact ? 'View tweet in Community Archive' : 'Archive',
    })
    for (const link of links) {
      jest.clearAllMocks()
      link.addEventListener('click', (event) => event.preventDefault())
      fireEvent.click(link)
      expect(capturePostHogEvent).toHaveBeenCalledTimes(1)
      expect(capturePostHogEvent).toHaveBeenCalledWith('tweet_card_action', {
        action: 'open',
        origin: 'search',
        has_media: false,
        has_quoted_tweet: false,
        is_featured: false,
      })
    }
  },
)

describe('compact search row', () => {
  const renderRow = () => {
    render(<TweetComponent tweet={tweet} compact permalinkOrigin="search" />)
    const [mobileLink, desktopLink] = screen.getAllByRole('link', {
      name: 'View tweet in Community Archive',
    })
    const opened = jest.fn()
    for (const link of [mobileLink, desktopLink])
      link.addEventListener('click', (event) => {
        event.preventDefault()
        opened(link.getAttribute('href'))
      })
    return opened
  }

  beforeEach(() => jest.clearAllMocks())

  it('opens the archive page when the row is clicked, without an Archive button', () => {
    const opened = renderRow()

    expect(screen.queryByText('Archive')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('A tweet'))

    expect(opened).toHaveBeenCalledTimes(1)
    expect(opened.mock.calls[0][0]).toMatch(/^\/tweets\/123\?from=search/)
    expect(capturePostHogEvent).toHaveBeenCalledWith(
      'tweet_card_action',
      expect.objectContaining({ action: 'open' }),
    )
  })

  it('leaves clicks on the row’s own links alone', () => {
    const opened = renderRow()
    const twitter = screen.getAllByRole('link', {
      name: 'View original tweet on Twitter',
    })[0]
    twitter.addEventListener('click', (event) => event.preventDefault())

    fireEvent.click(twitter)
    fireEvent.click(screen.getAllByRole('link', { name: /profile/ })[0])

    expect(opened).not.toHaveBeenCalled()
  })

  it('opens a new tab for modifier clicks', () => {
    const opened = renderRow()
    const open = jest.spyOn(window, 'open').mockReturnValue(null)

    fireEvent.click(screen.getByText('A tweet'), { metaKey: true })

    expect(open).toHaveBeenCalledWith(
      expect.stringMatching(/^\/tweets\/123\?from=search/),
      '_blank',
      'noopener',
    )
    expect(opened).not.toHaveBeenCalled()
    open.mockRestore()
  })
})
