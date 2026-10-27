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

// These assertions intentionally inspect arbitrary elements from the rendered
// server component tree, whose prop shape depends on the child component.
type TreeProps = { children?: ReactNode; fallback?: ReactNode; tweet?: unknown }
function elements(node: ReactNode): ReactElement<TreeProps>[] {
  return Children.toArray(node).flatMap((child) =>
    isValidElement<TreeProps>(child)
      ? [child, ...elements(child.props.children)]
      : [],
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
    canReadConversation: true,
    quotingTweets: [],
    quotingTweetCount: 0,
    quotePosts,
  })

  // Neither optional promise has resolved when the page produces its shell.
  const shell = await TweetPage({
    params: Promise.resolve({ tweet_id: tweet.tweet_id }),
  })
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

  const incoming = boundaries[1].props.children as ReactElement<
    { quotePosts: typeof quotePosts; targetTweet: typeof tweet },
    (props: {
      quotePosts: typeof quotePosts
      targetTweet: typeof tweet
    }) => Promise<ReactNode>
  >
  const sidebar = incoming.type(incoming.props)
  const quoted = { ...tweet, tweet_id: '456' }
  resolveQuotes({ tweets: [quoted], totalCount: 19 })
  await expect(sidebar).resolves.toMatchObject({
    key: '123',
    props: { tweets: [quoted], totalCount: 19, targetTweet: tweet },
  })
})

test('guests see labeled previews without rendering conversation boundaries', async () => {
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
  ;(loadTweetPage as jest.Mock).mockResolvedValue({
    tweet,
    subject: buildTweetPageSubject(tweet, null),
    threadTree: null,
    summary: null,
    summaryPending: false,
    canReadConversation: false,
    quotingTweets: [],
    quotingTweetCount: 0,
  })
  const shell = await TweetPage({ params: Promise.resolve({ tweet_id: '123' }) })
  expect(elements(shell).filter((node) => node.type === Suspense)).toHaveLength(
    0,
  )
  const html = renderToStaticMarkup(shell)
  expect(html).not.toContain('aria-label="Summary preview"')
  expect(html).toContain('aria-label="Replies preview"')
  expect(html).toContain('aria-label="Quote tweets preview"')
  expect(html).toContain('/opt-in?redirect=%2Ftweets%2F123')
})
