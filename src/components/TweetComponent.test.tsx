import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import TweetComponent, { type TweetData } from './TweetComponent'

jest.mock('@/components/TweetAvatarImage', () => ({
  __esModule: true,
  default: () => null,
}))
jest.mock('@/components/ImageLightbox', () => ({
  __esModule: true,
  default: () => null,
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
