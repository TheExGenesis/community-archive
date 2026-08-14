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
}))

test('shows canonical banger cards progressively with media and evidence', async () => {
  const user = userEvent.setup()
  render(
    <Workspace
      avatarUrl={null}
      contextTitle="Overall — Bangers"
      contextDesc="Quoted at least twice."
      tweets={tweets}
      bangersAvailable
      media={[]}
      mediaCount={0}
      people={[]}
      peopleTitle="Top people"
    />,
  )

  expect(
    screen.getByRole('link', {
      name: '20 archived quotes. Open tweet to see them.',
    }),
  ).toBeInTheDocument()
  expect(screen.getByTestId('tweet-image')).toHaveAttribute(
    'data-src',
    'https://example.com/banger.jpg',
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
  expect(screen.queryByText('Banger 12')).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Show more bangers' }))

  expect(screen.getByText('Banger 12')).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Show more bangers' }),
  ).not.toBeInTheDocument()
})
