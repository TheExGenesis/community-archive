import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ProfileTweet } from '@/lib/metaTwitter/types'
import { ProfileTweetFallback } from './ProfileTweetFallback'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}))
jest.mock('@/components/TweetAvatarImage', () => ({
  __esModule: true,
  default: () => null,
}))
jest.mock('@/components/ImageLightbox', () => ({
  __esModule: true,
  default: () => null,
}))

const tweet = (id: string, text: string): ProfileTweet => ({
  tweet_id: id,
  account_id: '42',
  created_at: '2026-08-14T09:00:00.000Z',
  full_text: text,
  favorite_count: 30,
  retweet_count: 4,
  reply_to_username: null,
  username: 'alice',
  account_display_name: 'Alice',
  avatar_media_url: null,
  media: [],
  quote_tweet_id: null,
  quoted_tweet: null,
})

test('starts with most engaged tweets and can switch to recent tweets', async () => {
  const user = userEvent.setup()
  render(
    <ProfileTweetFallback
      avatarUrl={null}
      className="order-2"
      displayName="Alice"
      engagedTweets={[tweet('101', 'Most engaged tweet')]}
      recentTweets={[tweet('102', 'Newest tweet')]}
      returnTo="/user/alice"
    />,
  )

  expect(screen.getByRole('heading', { name: 'More from Alice' })).toBeVisible()
  expect(
    screen.getByRole('heading', { name: 'More from Alice' }).closest('section'),
  ).toHaveClass('order-2', 'pt-5')
  expect(
    screen.getByRole('heading', { name: 'More from Alice' }).closest('section'),
  ).not.toHaveClass('mt-12')
  expect(screen.getByText('Most engaged tweet')).toBeVisible()
  expect(screen.queryByText('Newest tweet')).not.toBeInTheDocument()

  await user.click(screen.getByRole('tab', { name: 'Recent tweets' }))

  expect(screen.getByText('Newest tweet')).toBeVisible()
  expect(screen.queryByText('Most engaged tweet')).not.toBeInTheDocument()
})
