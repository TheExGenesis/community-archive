import {
  Children,
  isValidElement,
  Suspense,
  type ReactElement,
  type ReactNode,
} from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import TweetPage from '@/app/tweets/[tweet_id]/page'
import GuestTweetPage, {
  dynamic as guestDynamic,
  revalidate as guestRevalidate,
} from '@/app/guest/tweets/[tweet_id]/page'
import { dynamic as pageDynamic } from '@/app/tweets/[tweet_id]/page'
import TweetPermalink from '@/components/tweetPage/TweetPermalink'
import { loadGuestTweetPage, loadTweetPage } from './loadTweetPage'
import { buildTweetPageSubject } from './subject'

jest.mock('./loadTweetPage', () => ({
  loadTweetPage: jest.fn(),
  loadGuestTweetPage: jest.fn(),
}))
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

// The routes return <TweetPermalink page={...} />; expand it the way React would.
function render(route: ReactElement): ReactElement {
  expect(route.type).toBe(TweetPermalink)
  return TweetPermalink(route.props)
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

const guestView = {
  tweet,
  subject: buildTweetPageSubject(tweet, null),
  threadTree: null,
  summary: null,
  summaryPending: false,
  canReadConversation: false,
  quotingTweets: [],
  quotingTweetCount: 0,
}

beforeEach(() => jest.clearAllMocks())

test('shows a real heading and tweet while summary and quotes are pending, then delivers quotes', async () => {
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
  const shell = render(
    await TweetPage({ params: { tweet_id: tweet.tweet_id } }),
  )
  const nodes = elements(shell)
  const boundaries = nodes.filter((node) => node.type === Suspense)
  // The back link reads the query string in the browser, then the summary
  // and quotes stream in.
  expect(boundaries).toHaveLength(3)
  expect(renderToStaticMarkup(boundaries[1].props.fallback)).toContain(
    'Tweet by Alice</h1>',
  )
  expect(renderToStaticMarkup(boundaries[2].props.fallback)).toContain(
    'Loading archived quotes',
  )
  expect(nodes.some((node) => node.props.tweet === tweet)).toBe(true)

  const incoming = boundaries[2].props.children
  const sidebar = incoming.type(incoming.props)
  const quoted = { ...tweet, tweet_id: '456' }
  resolveQuotes({ tweets: [quoted], totalCount: 19 })
  await expect(sidebar).resolves.toMatchObject({
    key: '123',
    props: { tweets: [quoted], totalCount: 19, targetTweet: tweet },
  })
})

test('guests see labeled previews without rendering conversation boundaries', async () => {
  ;(loadTweetPage as jest.Mock).mockResolvedValue(guestView)
  const shell = render(await TweetPage({ params: { tweet_id: '123' } }))
  // Only the back link's boundary remains.
  expect(elements(shell).filter((node) => node.type === Suspense)).toHaveLength(
    1,
  )
  const html = renderToStaticMarkup(shell)
  expect(html).not.toContain('aria-label="Summary preview"')
  expect(html).toContain('aria-label="Replies preview"')
  expect(html).toContain('aria-label="Quote tweets preview"')
  expect(html).toContain('/opt-in?redirect=%2Ftweets%2F123')
})

test('the cached guest route renders the same preview from the request-free loader', async () => {
  ;(loadGuestTweetPage as jest.Mock).mockResolvedValue(guestView)
  const html = renderToStaticMarkup(
    render(await GuestTweetPage({ params: { tweet_id: '123' } })),
  )
  expect(loadTweetPage).not.toHaveBeenCalled()
  expect(html).toContain('Tweet by Alice</h1>')
  expect(html).toContain('aria-label="Replies preview"')
  expect(html).toContain('/opt-in?redirect=%2Ftweets%2F123')
  expect(guestDynamic).toBe('force-static')
  expect(guestRevalidate).toBe(3600)
  // Consent-dependent responses stay out of the shared cache.
  expect(pageDynamic).toBe('force-dynamic')
})
