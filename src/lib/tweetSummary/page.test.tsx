import {
  Children,
  isValidElement,
  Suspense,
  type ReactElement,
  type ReactNode,
} from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import TweetPage from '@/app/tweets/[tweet_id]/page'
import TweetSummaryRequester from '@/components/tweetSummary/TweetSummaryRequester'
import SummaryHeading from '@/components/tweetSummary/SummaryHeading'
import { loadTweetPage } from './loadTweetPage'
import { buildTweetPageSubject } from './subject'

jest.mock('./loadTweetPage', () => ({ loadTweetPage: jest.fn() }))
jest.mock('./store', () => ({ getTweetPageSummary: jest.fn() }))
jest.mock('@/utils/supabase', () => ({ createBrowserClient: jest.fn() }))
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
  TweetBackLinkFallback: () => null,
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

test('shows a real heading and tweet while summary and quotes are pending, then delivers quotes', async () => {
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
    summaryMissing: true,
    quotingTweets: [],
    quotingTweetCount: 0,
    quotePosts,
  })

  // The quotes promise has not resolved when the page produces its shell.
  const shell = await TweetPage({ params: { tweet_id: tweet.tweet_id } })
  const nodes = elements(shell)
  const boundaries = nodes.filter((node) => node.type === Suspense)
  // The back link reads the query string in the browser; quotes stream in.
  expect(boundaries).toHaveLength(2)
  expect(renderToStaticMarkup(boundaries[1].props.fallback)).toContain(
    'Loading archived quotes',
  )
  // Without a stored summary the neutral heading renders at once and the
  // browser, not the cached page, decides whether to ask for generation.
  const requester = nodes.find((node) => node.type === TweetSummaryRequester)!
  expect(requester.props).toMatchObject({ tweetId: '123', subject })
  expect(renderToStaticMarkup(requester)).toContain('Tweet by Alice</h1>')
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

test('a stored summary renders in the cached page without a requester', async () => {
  const summary = { title: 'A title', description: 'A description' }
  ;(loadTweetPage as jest.Mock).mockResolvedValue({
    tweet,
    threadTree: null,
    subject,
    summary,
    summaryMissing: false,
    quotingTweets: [],
    quotingTweetCount: 0,
  })

  const nodes = elements(await TweetPage({ params: { tweet_id: '123' } }))
  expect(nodes.some((node) => node.type === TweetSummaryRequester)).toBe(false)
  const heading = nodes.find((node) => node.type === SummaryHeading)!
  expect(heading.props).toEqual({ subject, summary })
  expect(renderToStaticMarkup(heading)).toContain('A title</h1>')
})
