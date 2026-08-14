import { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Workspace } from './Workspace'
import type { BangerTweet } from '@/lib/metaTwitter/types'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
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
      contextTitle="Overall — Bangers"
      contextDesc="Quoted at least twice."
      tweets={tweets.slice(0, 2)}
      bangersAvailable
      bangersLoading={false}
      media={[]}
      mediaCount={0}
      people={[]}
      peopleTitle="Top people"
      sidebarLoading={false}
      sidebarFailed={false}
      onRetrySidebar={jest.fn()}
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
    screen.getAllByRole('heading', { name: 'Overall — Bangers' }),
  ).toHaveLength(1)
  expect(
    screen.queryByRole('heading', { name: 'Bangers' }),
  ).not.toBeInTheDocument()
  expect(screen.getByText('Quoted at least twice.')).toBeVisible()

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
