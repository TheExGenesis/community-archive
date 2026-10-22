import {
  Children,
  isValidElement,
  Suspense,
  type ReactElement,
  type ReactNode,
} from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import TweetPage from '@/app/tweets/[tweet_id]/page'
import { loadTweetPage } from './loadTweetPage'
import { buildTweetPageSubject } from './subject'

jest.mock('./loadTweetPage', () => ({ loadTweetPage: jest.fn() }))
jest.mock('./store', () => ({ getTweetPageSummary: jest.fn() }))
jest.mock('@/components/TweetComponent', () => ({
  __esModule: true,
  default: () => null,
}))
jest.mock('@/components/ThreadView', () => ({
  __esModule: true,
  default: () => null,
}))
jest.mock('@/components/TweetBackLink', () => ({
  __esModule: true,
  default: () => null,
}))
jest.mock('@/components/QuotingTweetsSidebar', () => ({
  __esModule: true,
  default: () => null,
}))

function elements(node: ReactNode): ReactElement[] {
  return Children.toArray(node).flatMap((child) =>
    isValidElement(child) ? [child, ...elements(child.props.children)] : [],
  )
}

test('shows a real heading and tweet while summary and quotes are pending, then delivers quotes', async () => {
  const tweet = {
    tweet_id: '123',
    account_id: '1',
    username: 'alice',
    account_display_name: 'Alice',
    created_at: '2026-10-20T00:00:00Z',
    full_text: 'The original tweet',
    favorite_count: 1,
    retweet_count: 0,
    reply_to_tweet_id: null,
    quote_tweet_id: null,
    retweeted_tweet_id: null,
    avatar_media_url: null,
    media: [],
    urls: [],
  }
  const subject = buildTweetPageSubject(tweet, null)
  let resolveQuotes!: (data: {
    tweets: (typeof tweet)[]
    totalCount: number
  }) => void
  const quotePosts = new Promise<{
    tweets: (typeof tweet)[]
    totalCount: number
  }>((resolve) => {
    resolveQuotes = resolve
  })
  ;(loadTweetPage as jest.Mock).mockResolvedValue({
    tweet,
    threadTree: null,
    subject,
    summary: null,
    summaryPending: true,
    quotingTweets: [],
    quotingTweetCount: 0,
    quotePosts,
  })

  // Neither optional promise has resolved when the page produces its shell.
  const shell = await TweetPage({ params: { tweet_id: tweet.tweet_id } })
  const nodes = elements(shell)
  const boundaries = nodes.filter((node) => node.type === Suspense)
  expect(boundaries).toHaveLength(2)
  expect(renderToStaticMarkup(boundaries[0].props.fallback)).toContain(
    'Tweet by Alice</h1>',
  )
  expect(renderToStaticMarkup(boundaries[1].props.fallback)).toContain(
    'Loading archived quotes',
  )
  expect(nodes.some((node) => node.props.tweet === tweet)).toBe(true)

  const incoming = boundaries[1].props.children
  const sidebar = incoming.type(incoming.props)
  const quoted = { ...tweet, tweet_id: '456' }
  resolveQuotes({ tweets: [quoted], totalCount: 19 })
  await expect(sidebar).resolves.toMatchObject({
    key: '123',
    props: { tweets: [quoted], totalCount: 19, targetTweet: tweet },
  })
})
