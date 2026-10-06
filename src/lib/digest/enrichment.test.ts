import type { ClickHouseTweetThreadPageData } from '@/lib/clickhouseTweetPage'
import { buildConversationTree, type ThreadTweet } from '@/lib/conversationTree'
import type { PortalTweet } from '@/lib/portal/types'
import type { TweetData } from '@/lib/tweets/types'
import { enrichDigestCandidates, type DigestContextSources } from './enrichment'

const window = {
  windowStart: '2026-08-12T06:00:00.000Z',
  windowEnd: '2026-08-13T06:00:00.000Z',
}
const inWindow = '2026-08-12T12:00:00.000Z'
const beforeWindow = '2026-08-10T12:00:00.000Z'

const node = (
  id: string,
  replyTo: string | null,
  createdAt = inWindow,
  likes = 1,
  quoted?: ThreadTweet['quoted_tweet'],
): ThreadTweet => ({
  tweet_id: id,
  account_id: `9${id}`,
  created_at: createdAt,
  full_text: `post ${id}`,
  retweet_count: 0,
  favorite_count: likes,
  reply_to_tweet_id: replyTo,
  reply_to_user_id: null,
  reply_to_username: null,
  username: `user_${id}`,
  account_display_name: `User ${id}`,
  quote_tweet_id: quoted?.tweet_id ?? null,
  quoted_tweet: quoted ?? null,
})

const page = (
  selectedId: string,
  nodes: ThreadTweet[],
): ClickHouseTweetThreadPageData => {
  const selected = nodes.find(({ tweet_id }) => tweet_id === selectedId)!
  return {
    tweet: {
      ...selected,
      retweeted_tweet_id: null,
      reply_to_username: undefined,
      avatar_media_url: undefined,
      quoted_tweet: selected.quoted_tweet ?? undefined,
    } as unknown as TweetData,
    threadTree: buildConversationTree(nodes),
  }
}

const quotePost = (id: string, likes: number, createdAt = inWindow) =>
  ({
    tweet_id: id,
    account_id: `9${id}`,
    created_at: createdAt,
    full_text: `quote ${id}`,
    retweet_count: 0,
    favorite_count: likes,
    reply_to_tweet_id: null,
    quote_tweet_id: '100',
    username: `user_${id}`,
    account_display_name: `User ${id}`,
    media: [],
  }) as unknown as TweetData

const banger: PortalTweet = {
  id: '100',
  username: 'user_100',
  name: 'User 100',
  avatar: null,
  text: 'post 100',
  observedAt: inWindow,
  createdAt: inWindow,
  likes: 500,
  rts: 10,
  quoteCount: 3,
}

const quotedPost = {
  ...node('200', '199', beforeWindow),
  full_text: 'the quoted announcement',
}

const threads: Record<string, ClickHouseTweetThreadPageData> = {
  // The banger replies to 99, which replies to 98; 101 and 102 reply below it.
  '100': page('100', [
    node('98', null, beforeWindow),
    node('99', '98', beforeWindow),
    node('100', '99', inWindow, 500, quotedPost),
    node('101', '100', inWindow, 5),
    node('102', '101', inWindow, 9),
    node('103', '100', beforeWindow, 50),
  ]),
  // The quoted post sits under 199 in its own conversation.
  '200': page('200', [node('199', null, beforeWindow), quotedPost]),
  // Quote post 300 drew one in-window reply.
  '300': page('300', [
    node('300', null, inWindow, 40),
    node('301', '300', inWindow, 2),
  ]),
}

const sources: DigestContextSources = {
  fetchThread: async (tweetId) => threads[tweetId] ?? null,
  fetchQuotePosts: async () => ({
    tweets: [quotePost('300', 40), quotePost('310', 3, beforeWindow)],
    totalCount: 2,
  }),
}

describe('digest context enrichment', () => {
  test('collects the reply chain, quoted thread, replies, quotes and replies to quotes', async () => {
    const { enrichedCandidates, failedFetches } = await enrichDigestCandidates(
      [{ tweet: banger, sourceRank: 1, selected: true }],
      window,
      sources,
    )
    const [enriched] = enrichedCandidates

    expect(failedFetches).toBe(0)
    expect(
      enriched.commentary.map(({ id }) => [id, enriched.contextKinds?.[id]]),
    ).toEqual([
      ['98', 'parent'],
      ['99', 'parent'],
      ['199', 'quoted_thread'],
      ['200', 'quoted'],
      ['102', 'reply'],
      ['101', 'reply'],
      ['300', 'quote'],
      ['301', 'quote_reply'],
    ])
    expect(enriched.relations).toMatchObject({
      '100': { replyToTweetId: '99', quotesTweetId: '200' },
      '102': { replyToTweetId: '101' },
      '300': { quotesTweetId: '100' },
      '301': { replyToTweetId: '300' },
      '200': { replyToTweetId: '199' },
    })
    expect(enriched.replyTweetIds).toEqual(['102', '101'])
    expect(enriched.totalReplyCount).toBe(3)
    expect(enriched.commentary.find(({ id }) => id === '200')?.text).toBe(
      'the quoted announcement',
    )
  })

  test('keeps whatever context loaded when a fetch fails', async () => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {})
    const { enrichedCandidates, failedFetches } = await enrichDigestCandidates(
      [{ tweet: banger, sourceRank: 1, selected: true }],
      window,
      {
        ...sources,
        fetchQuotePosts: async () => {
          throw new Error('gateway unavailable')
        },
      },
    )

    expect(failedFetches).toBe(1)
    expect(
      enrichedCandidates[0].commentary.some(
        ({ id }) => enrichedCandidates[0].contextKinds?.[id] === 'quote',
      ),
    ).toBe(false)
    expect(enrichedCandidates[0].commentary.map(({ id }) => id)).toContain('99')
    consoleError.mockRestore()
  })
})
