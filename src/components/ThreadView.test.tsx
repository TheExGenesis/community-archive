import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import ThreadView from './ThreadView'
import type { ConversationTree, ThreadTweet } from '@/lib/threadUtils'

jest.mock('./TweetComponent', () => ({
  __esModule: true,
  default: ({
    tweet,
    isPermalinkPage,
  }: {
    tweet: { full_text: string }
    isPermalinkPage?: boolean
  }) => (
    <div>
      {tweet.full_text} {isPermalinkPage ? '(permalink)' : ''}
    </div>
  ),
}))

const tweet = (
  tweetId: string,
  replyToTweetId: string | null,
): ThreadTweet => ({
  tweet_id: tweetId,
  account_id: '1',
  created_at: `2026-08-10T12:0${tweetId}:00.000Z`,
  full_text: `tweet ${tweetId}`,
  retweet_count: 0,
  favorite_count: 0,
  reply_to_tweet_id: replyToTweetId,
  reply_to_user_id: replyToTweetId ? '1' : null,
  reply_to_username: replyToTweetId ? 'alice' : null,
  username: 'alice',
  account_display_name: 'Alice',
})

describe('ThreadView', () => {
  test('uses one fixed reply rail instead of progressively narrowing deep threads', () => {
    const tree: ConversationTree = {
      root: '1',
      roots: ['1'],
      tweets: {
        '1': tweet('1', null),
        '2': tweet('2', '1'),
        '3': tweet('3', '2'),
        '4': tweet('4', '3'),
      },
      children: { '1': ['2'], '2': ['3'], '3': ['4'], '4': [] },
      parents: { '2': '1', '3': '2', '4': '3' },
      paths: { '4': ['1', '2', '3', '4'] },
    }

    const { container } = render(<ThreadView tree={tree} />)
    const containers = container.querySelectorAll('.thread-tweet-container')

    expect(screen.getByText('tweet 4')).toBeVisible()
    expect(containers).toHaveLength(4)
    expect(containers[0]).not.toHaveClass('border-l-2', 'pl-3')
    expect(containers[1]).toHaveClass('border-l-2', 'pl-3')
    expect(containers[2]).not.toHaveClass('border-l-2', 'pl-3')
    expect(containers[3]).not.toHaveClass('border-l-2', 'pl-3')
  })

  test('marks only the highlighted tweet as the current permalink', () => {
    const tree: ConversationTree = {
      root: '1',
      roots: ['1'],
      tweets: { '1': tweet('1', null), '2': tweet('2', '1') },
      children: { '1': ['2'], '2': [] },
      parents: { '2': '1' },
      paths: { '2': ['1', '2'] },
    }

    render(<ThreadView tree={tree} highlightTweetId="2" />)

    expect(screen.getByText('tweet 1')).toBeVisible()
    expect(screen.getByText('tweet 2 (permalink)')).toBeVisible()
  })
})
