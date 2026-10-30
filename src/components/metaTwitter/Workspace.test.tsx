import { createRef, type ReactNode } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BANGER_SCORE_EXPLANATION, Workspace } from './Workspace'
import type { ArchiveMediaItem, BangerTweet } from '@/lib/metaTwitter/types'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
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
    label,
    gallery,
    index,
    badge,
  }: {
    src: string
    alt: string
    label?: string
    gallery?: { href?: string }[]
    index?: number
    badge?: ReactNode
  }) => (
    <span
      data-testid="tweet-image"
      data-src={src}
      aria-label={label ?? alt}
      data-index={index}
      data-gallery={gallery?.map((image) => image.href).join(' ')}
    >
      {badge}
    </span>
  ),
}))

const tweets: BangerTweet[] = Array.from({ length: 13 }, (_, index) => ({
  tweet_id: String(100 + index),
  account_id: '42',
  created_at: `2025-01-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
  full_text: `Banger ${index}`,
  favorite_count: 100 - index,
  retweet_count: 10 - Math.min(index, 10),
  reply_to_username: null,
  username: 'alice',
  account_display_name: 'Alice',
  avatar_media_url: null,
  media:
    index === 0
      ? [
          {
            media_url: 'https://example.com/banger.jpg',
            media_type: 'photo',
            width: 1200,
            height: 800,
          },
        ]
      : [],
  quote_count: 20 - index,
  quoting_accounts: 20 - index,
  quote_tweet_id: index === 0 ? '200' : null,
  quoted_tweet:
    index === 0
      ? {
          tweet_id: '200',
          account_id: '77',
          created_at: '2024-12-31T23:59:00.000Z',
          full_text: 'The quoted source',
          favorite_count: 70,
          retweet_count: 6,
          reply_to_username: null,
          username: 'quoted_member',
          account_display_name: 'Quoted Member',
          avatar_media_url: null,
          media: [
            {
              media_url: 'https://example.com/quoted.jpg',
              media_type: 'photo',
              width: 900,
              height: 600,
            },
          ],
        }
      : null,
}))

test('shows the initial canonical banger cards with media and profile return links', async () => {
  const user = userEvent.setup()
  const onLoadMore = jest.fn()
  render(
    <Workspace
      avatarUrl={null}
      contextTitle="Best of Alice"
      tweets={tweets.slice(0, 2)}
      bangersAvailable
      bangersLoading={false}
      media={[]}
      mediaCount={0}
      people={[]}
      peopleTitle="Top people"
      mediaLoading={false}
      mediaFailed={false}
      onRetryMedia={jest.fn()}
      peopleLoading={false}
      peopleFailed={false}
      onRetryPeople={jest.fn()}
      sort="quotes"
      onSortChange={jest.fn()}
      hasMore
      loadMoreFailed={false}
      onLoadMore={onLoadMore}
      loadMoreRef={createRef<HTMLDivElement>()}
      returnTo="/user/alice?chapter=2025"
    />,
  )

  expect(
    screen.getAllByRole('heading', { name: 'Best of Alice' }),
  ).toHaveLength(1)
  expect(
    screen.queryByRole('button', { name: 'Edit profile' }),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('heading', { name: 'Bangers' }),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByText(
      '167 bangers · 2+ Community Archive member quote posts · self-quotes excluded',
    ),
  ).not.toBeInTheDocument()

  const scoreInfo = screen.getByRole('button', {
    name: 'How banger score works',
  })
  expect(scoreInfo).toBeVisible()
  const scoreExplanation = screen.getByRole('tooltip')
  expect(scoreInfo).toHaveAttribute(
    'aria-describedby',
    'profile-banger-score-description',
  )
  expect(scoreExplanation).toHaveTextContent(BANGER_SCORE_EXPLANATION)
  expect(scoreExplanation).toHaveClass(
    'group-hover:opacity-100',
    'group-focus-within:opacity-100',
  )

  expect(
    screen.getByRole('link', {
      name: '20 archived quotes. Open tweet to see them.',
    }),
  ).toBeInTheDocument()
  expect(screen.getAllByTestId('tweet-image')[0]).toHaveAttribute(
    'data-src',
    'https://example.com/banger.jpg',
  )
  expect(screen.getByText('The quoted source')).toBeVisible()
  expect(screen.getAllByTestId('tweet-image')[1]).toHaveAttribute(
    'data-src',
    'https://example.com/quoted.jpg',
  )
  expect(screen.getByText('100 likes')).toHaveClass('sr-only')
  expect(screen.getByText('10 reposts')).toHaveClass('sr-only')
  expect(
    screen.getAllByRole('link', {
      name: 'View tweet on X (opens in a new tab)',
    })[0],
  ).toHaveAttribute('href', 'https://x.com/alice/status/100')
  expect(
    screen.queryByRole('link', { name: 'View tweet by @alice' }),
  ).not.toBeInTheDocument()
  expect(screen.queryByText(/❝|🔁|♥|↗/)).not.toBeInTheDocument()
  expect(
    screen.getByRole('link', {
      name: '20 archived quotes. Open tweet to see them.',
    }),
  ).toHaveAttribute(
    'href',
    '/tweets/100?from=profile&returnTo=%2Fuser%2Falice%3Fchapter%3D2025',
  )
  expect(screen.queryByText('Banger 2')).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Load more bangers' }))

  expect(onLoadMore).toHaveBeenCalledTimes(1)
})

test('opens chapter media in a gallery over every loaded item instead of navigating', () => {
  const media: ArchiveMediaItem[] = Array.from({ length: 8 }, (_, index) => ({
    media_url: `https://example.com/media-${index}.jpg`,
    media_type: 'photo',
    width: 800,
    height: 600,
    tweet_id: String(200 + index),
    created_at: '2025-02-01T00:00:00.000Z',
    favorite_count: 0,
  }))
  render(
    <Workspace
      avatarUrl={null}
      contextTitle="Best of Alice"
      tweets={[]}
      bangersAvailable
      bangersLoading={false}
      media={media}
      mediaCount={24}
      people={[]}
      peopleTitle="Top people"
      mediaLoading={false}
      mediaFailed={false}
      onRetryMedia={jest.fn()}
      peopleLoading={false}
      peopleFailed={false}
      onRetryPeople={jest.fn()}
      sort="quotes"
      onSortChange={jest.fn()}
      hasMore={false}
      loadMoreFailed={false}
      onLoadMore={jest.fn()}
      loadMoreRef={createRef<HTMLDivElement>()}
      returnTo="/user/alice?chapter=2025"
    />,
  )

  const panel = screen.getByRole('region', { name: 'Media' })
  expect(within(panel).queryByRole('link')).not.toBeInTheDocument()
  const tiles = within(panel).getAllByLabelText(/^Open media \d of 8/)
  expect(tiles).toHaveLength(6)
  const galleryHrefs = media
    .map(
      (item) =>
        `/tweets/${item.tweet_id}?from=profile&returnTo=%2Fuser%2Falice%3Fchapter%3D2025`,
    )
    .join(' ')
  tiles.forEach((tile, index) => {
    expect(tile).toHaveAttribute('data-index', String(index))
    expect(tile).toHaveAttribute('data-gallery', galleryHrefs)
  })
  expect(tiles[5]).toHaveAttribute(
    'aria-label',
    'Open media 6 of 8, 18 more in this chapter',
  )
  expect(tiles[5]).toHaveTextContent('+18')
  expect(tiles[4]).toBeEmptyDOMElement()
})

test('top people show initials for missing or failed avatars and photos when loaded', () => {
  const preloads: HTMLImageElement[] = []
  const imageSpy = jest.spyOn(window, 'Image').mockImplementation(() => {
    const image = document.createElement('img')
    preloads.push(image)
    return image
  })
  try {
    render(
      <Workspace
        avatarUrl={null}
        contextTitle="Best of Alice"
        tweets={[]}
        bangersAvailable
        bangersLoading={false}
        media={[]}
        mediaCount={0}
        people={[
          {
            user_id: '1',
            screen_name: 'romy',
            name: 'Romy',
            avatar_media_url:
              'https://pbs.twimg.com/profile_images/1/old_400x400.jpg',
            interactions: 78,
            in_archive: true,
          },
          {
            user_id: '2',
            screen_name: 'no_photo',
            name: '𒐪',
            avatar_media_url: null,
            interactions: 59,
            in_archive: false,
          },
          {
            user_id: '3',
            screen_name: 'brangus',
            name: 'Brangus',
            avatar_media_url:
              'https://pbs.twimg.com/profile_images/3/current_normal.jpg',
            interactions: 33,
            in_archive: false,
          },
        ]}
        peopleTitle="Top people"
        mediaLoading={false}
        mediaFailed={false}
        onRetryMedia={jest.fn()}
        peopleLoading={false}
        peopleFailed={false}
        onRetryPeople={jest.fn()}
        sort="quotes"
        onSortChange={jest.fn()}
        hasMore={false}
        loadMoreFailed={false}
        onLoadMore={jest.fn()}
        loadMoreRef={createRef<HTMLDivElement>()}
        returnTo="/user/alice"
      />,
    )

    const panel = screen.getByRole('region', { name: 'Top people' })
    expect(preloads).toHaveLength(2)
    preloads.forEach((image) =>
      expect(image.referrerPolicy).toBe('no-referrer'),
    )
    expect(preloads[0].src).toContain('/old_normal.jpg')
    fireEvent.error(preloads[0])
    fireEvent.load(preloads[1])

    expect(within(panel).getByText('R')).toBeVisible()
    expect(within(panel).getAllByText('𒐪')).toHaveLength(2)
    expect(within(panel).queryByText('B')).not.toBeInTheDocument()
    const images = panel.querySelectorAll('img')
    expect(images).toHaveLength(1)
    expect(images[0]).toHaveAttribute('src', preloads[1].src)
    expect(images[0]).toHaveAttribute('referrerpolicy', 'no-referrer')
    expect(within(panel).getByRole('link')).toHaveAttribute('href', '/user/1')
  } finally {
    imageSpy.mockRestore()
  }
})
