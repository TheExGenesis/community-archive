import { POST, GET, DELETE } from '@/app/api/mcp/route'
import { fetchAnalyticsGatewayJson } from '@/lib/clickhouseGateway'
import { getAppPolicy } from '@/lib/community-apps/data'
import { resolveProfileCore } from '@/lib/metaTwitter/profile'
import { getPortalBangersPage } from '@/lib/portal/data'
import { getCuratedProfileBangersPage } from '@/lib/profileCuration'
import { getPublishedDigest } from '@/lib/digest/data'
import type { DigestEdition } from '@/lib/digest/types'
import type { PortalTweet } from '@/lib/portal/types'

jest.mock('next/headers', () => ({ cookies: () => ({}) }))
jest.mock('@/utils/supabase', () => ({
  createServerAnonClient: jest.fn(() => ({})),
}))
jest.mock('@/lib/clickhouseGateway', () => ({
  ...jest.requireActual('@/lib/clickhouseGateway'),
  fetchAnalyticsGatewayJson: jest.fn(),
}))
jest.mock('@/lib/searchTweetEnrichments', () => ({
  enrichSearchTweets: jest.fn(async (_client, tweets) => tweets),
}))
jest.mock('@/lib/community-apps/data', () => ({ getAppPolicy: jest.fn() }))
jest.mock('@/lib/metaTwitter/profile', () => ({
  resolveProfileCore: jest.fn(),
}))
jest.mock('@/lib/portal/data', () => ({ getPortalBangersPage: jest.fn() }))
jest.mock('@/lib/profileCuration', () => ({
  getCuratedProfileBangersPage: jest.fn(),
}))
jest.mock('@/lib/digest/data', () => ({ getPublishedDigest: jest.fn() }))

const endpoint = 'https://www.community-archive.org/api/mcp'
const sourceText = `Full archive text &amp; media. ${'Long text. '.repeat(200)}`
const tweet = {
  tweetId: '2085473085399150817',
  accountId: '10',
  createdAt: '2026-10-12T10:00:00.000Z',
  fullText: sourceText,
  replyToTweetId: '99',
  replyToUsername: 'parent',
  favoriteCount: '25',
  retweetCount: '4',
  username: 'alice',
  accountDisplayName: 'Alice',
  avatarMediaUrl: null,
  quoteTweetId: '202',
  retweetedTweetId: null,
  media: [
    {
      mediaUrl: 'https://example.com/photo.jpg',
      mediaType: 'photo',
      width: 1200,
      height: 800,
    },
  ],
}
const quoted = {
  ...tweet,
  tweetId: '202',
  accountId: '20',
  username: 'bob',
  fullText: 'Quoted &amp; complete',
  replyToTweetId: null,
}
const portalTweet: PortalTweet = {
  id: tweet.tweetId,
  accountId: '10',
  username: 'alice',
  name: 'Alice',
  text: sourceText,
  avatar: null,
  observedAt: tweet.createdAt,
  createdAt: tweet.createdAt,
  likes: 25,
  rts: 4,
  media: [{ url: 'https://example.com/photo.jpg', type: 'photo' }],
  quotedTweet: {
    id: '202',
    accountId: '20',
    username: 'bob',
    name: 'Bob',
    avatar: null,
    text: quoted.fullText,
    createdAt: tweet.createdAt,
    likes: 1,
    rts: 0,
    media: [],
  },
}
const edition = {
  status: 'published',
  digestDate: '2026-10-12',
  content: {
    executiveSummary: ['The published summary.'],
    stories: [
      {
        slug: 'archive',
        keyword: 'archive',
        title: 'Archive story',
        subtitle: 'A published story.',
        bullets: ['A source-backed fact.'],
        bangers: [portalTweet],
        commentary: [],
      },
    ],
  },
} as unknown as DigestEdition

type RpcBody = {
  result?: {
    serverInfo?: { name: string }
    tools?: {
      name: string
      annotations: { readOnlyHint: boolean }
      inputSchema: { additionalProperties?: boolean }
    }[]
    content?: { type: string; text?: string }[]
    structuredContent?: unknown
    isError?: boolean
  }
  error?: { code: number; message: string }
}

async function rpc(
  method: string,
  params: Record<string, unknown> = {},
  headers: Record<string, string> = {},
) {
  const response = await POST(
    new Request(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...headers,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    }),
  )
  const text = await response.text()
  const json = response.headers
    .get('content-type')
    ?.includes('text/event-stream')
    ? text
        .split('\n')
        .find((line) => line.startsWith('data: '))
        ?.slice(6)
    : text
  return { response, body: (json ? JSON.parse(json) : {}) as RpcBody }
}

const call = (name: string, args: Record<string, unknown> = {}) =>
  rpc('tools/call', { name, arguments: args })

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getAppPolicy).mockResolvedValue({
    blocked: new Set(),
    blockedIds: new Set(),
    members: new Set(),
  })
  jest.mocked(fetchAnalyticsGatewayJson).mockImplementation(async (path) => {
    if (path[0] === 'search')
      return { data: { tweets: [tweet], nextOffset: 20 } } as never
    if (path[0] === 'quote-posts')
      return {
        data: [{ ...tweet, displayName: 'Alice', avatarUrl: null }],
        query: { total: '3' },
      } as never
    if (path[2] === 'thread')
      return {
        data: {
          tweet: { ...tweet, quotedTweet: quoted },
          conversationTweets: [{ ...tweet, quotedTweet: quoted }],
        },
      } as never
    return { data: { tweet, quotedTweet: quoted } } as never
  })
  jest.mocked(resolveProfileCore).mockResolvedValue({
    accountId: '10',
    profile: { account_id: '10', username: 'alice', bio: 'A public bio.' },
  } as never)
  jest.mocked(getPortalBangersPage).mockResolvedValue({
    tweets: [portalTweet],
    pagination: { nextOffset: 20, candidateRankingTruncated: true },
  } as never)
  jest.mocked(getPublishedDigest).mockResolvedValue(edition)
})

test('initializes and lists only the seven approved read tools without a session', async () => {
  const initialized = await rpc('initialize', {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'test', version: '1.0.0' },
  })
  expect(initialized.response.status).toBe(200)
  expect(initialized.body.result?.serverInfo?.name).toBe('community-archive')
  expect(initialized.response.headers.get('mcp-session-id')).toBeNull()
  const { response, body } = await rpc('tools/list')
  expect(response.status).toBe(200)
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  expect(body.result?.tools?.map((tool) => tool.name)).toEqual([
    'search_tweets',
    'get_tweet',
    'get_thread',
    'get_quote_tweets',
    'get_profile',
    'get_bangers',
    'get_digest',
  ])
  for (const tool of body.result?.tools ?? []) {
    expect(tool.annotations.readOnlyHint).toBe(true)
    expect(tool.inputSchema.additionalProperties).toBe(false)
  }
  expect(fetchAnalyticsGatewayJson).not.toHaveBeenCalled()
})

test('supports a tool call with the 2026 protocol envelope', async () => {
  const { response, body } = await rpc(
    'tools/call',
    {
      name: 'get_tweet',
      arguments: { tweet_id: tweet.tweetId },
      _meta: {
        'io.modelcontextprotocol/protocolVersion': '2026-07-28',
        'io.modelcontextprotocol/clientCapabilities': {},
      },
    },
    {
      'mcp-protocol-version': '2026-07-28',
      'mcp-method': 'tools/call',
      'mcp-name': 'get_tweet',
    },
  )
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toContain('application/json')
  expect(body.result?.structuredContent).toMatchObject({
    tweet: { tweet_id: tweet.tweetId },
  })
})

test('searches with bounded filters and keeps full text and media', async () => {
  const { body } = await call('search_tweets', {
    query: 'open archive',
    username: '@Alice',
    reply_to_username: 'Bob',
    since: '2026-01-01',
    until: '2026-10-12',
    sort: 'likes',
    limit: 10,
    offset: 20,
  })
  const [path, params, options] = jest.mocked(fetchAnalyticsGatewayJson).mock
    .calls[0]
  expect(path).toEqual(['search'])
  expect(Object.fromEntries(params!)).toEqual({
    q: 'open archive',
    mode: 'phrase',
    from_user: 'alice',
    reply_to_user: 'bob',
    since: '2026-01-01',
    until: '2026-10-12',
    sort: 'likes',
    exclude_retweets: 'true',
    limit: '10',
    offset: '20',
  })
  expect(options?.revalidate).toBeUndefined()
  expect(body.result?.structuredContent).toMatchObject({
    tweets: [
      {
        tweet_id: tweet.tweetId,
        full_text: sourceText.replace('&amp;', '&'),
        media: [{ width: 1200, height: 800 }],
        href: `https://www.community-archive.org/tweets/${tweet.tweetId}`,
      },
    ],
    nextOffset: 20,
  })
})

test('reads a tweet with the complete quoted post', async () => {
  const { body } = await call('get_tweet', { tweet_id: tweet.tweetId })
  expect(body.result?.structuredContent).toMatchObject({
    tweet: {
      tweet_id: tweet.tweetId,
      quoted_tweet: {
        tweet_id: '202',
        full_text: 'Quoted & complete',
        media: [{ media_url: 'https://example.com/photo.jpg' }],
      },
    },
  })
})

test('can include retweets when requested', async () => {
  await call('search_tweets', { query: 'archive', exclude_retweets: false })
  expect(
    jest
      .mocked(fetchAnalyticsGatewayJson)
      .mock.calls[0][1]?.get('exclude_retweets'),
  ).toBe('false')
})

test('returns available thread records and missing parent IDs', async () => {
  const { body } = await call('get_thread', {
    tweet_id: tweet.tweetId,
    limit: 1,
  })
  expect(
    jest.mocked(fetchAnalyticsGatewayJson).mock.calls[0][1]?.get('limit'),
  ).toBe('1')
  expect(body.result?.structuredContent).toMatchObject({
    thread: {
      tweetId: tweet.tweetId,
      tweets: [{ tweet_id: tweet.tweetId }],
      missingParentIds: ['99'],
      limitReached: true,
    },
  })
})

test('keeps the quote list count and next page position', async () => {
  const { body } = await call('get_quote_tweets', {
    tweet_id: tweet.tweetId,
    limit: 1,
  })
  expect(body.result?.structuredContent).toMatchObject({
    tweets: [{ tweet_id: tweet.tweetId }],
    totalCount: 3,
    nextOffset: 1,
  })
  expect(
    Object.fromEntries(
      jest.mocked(fetchAnalyticsGatewayJson).mock.calls[0][1]!,
    ),
  ).toMatchObject({
    exclude_self: 'true',
    quote_ca_users_only: 'true',
    limit: '1',
  })
})

test('stops search pagination at the supported offset limit', async () => {
  jest
    .mocked(fetchAnalyticsGatewayJson)
    .mockResolvedValue({ data: { tweets: [tweet], nextOffset: 5020 } } as never)
  const { body } = await call('search_tweets', {
    query: 'archive',
    offset: 5000,
  })
  expect(body.result?.structuredContent).toMatchObject({
    nextOffset: null,
    paginationLimitReached: true,
  })
})

test('keeps the source page position when consent removes quote posts', async () => {
  jest.mocked(getAppPolicy).mockResolvedValue({
    blocked: new Set(['alice']),
    blockedIds: new Set(),
    members: new Set(),
  })
  const { body } = await call('get_quote_tweets', {
    tweet_id: tweet.tweetId,
    limit: 1,
  })
  expect(body.result?.structuredContent).toMatchObject({
    tweets: [],
    nextOffset: 1,
    paginationLimitReached: false,
  })
})

test('reads the public profile through the existing eligibility check', async () => {
  const { body } = await call('get_profile', { identifier: '@ALICE' })
  expect(resolveProfileCore).toHaveBeenCalledWith('alice')
  expect(body.result?.structuredContent).toMatchObject({
    profile: {
      username: 'alice',
      bio: 'A public bio.',
      href: 'https://www.community-archive.org/user/10',
    },
  })
})

test('keeps community Bangers ranking and its truncation flag', async () => {
  const { body } = await call('get_bangers', {
    query: 'archive',
    period: 'week',
  })
  expect(getPortalBangersPage).toHaveBeenCalledWith({
    query: 'archive',
    period: 'week',
    limit: 20,
    offset: 0,
    scope: 'all',
    sort: 'quotes',
  })
  expect(body.result?.structuredContent).toMatchObject({
    tweets: [{ id: tweet.tweetId, quotedTweet: { text: 'Quoted & complete' } }],
    pagination: { candidateRankingTruncated: true },
  })
})

test('uses profile curation for author Bangers', async () => {
  jest.mocked(getCuratedProfileBangersPage).mockResolvedValue({
    available: true,
    tweets: [],
    nextOffset: null,
  } as never)
  const { body } = await call('get_bangers', { username: 'alice' })
  expect(getCuratedProfileBangersPage).toHaveBeenCalledWith('10', {
    limit: 20,
    offset: 0,
    sort: 'quotes',
  })
  expect(getPortalBangersPage).not.toHaveBeenCalled()
  expect(body.result?.structuredContent).toMatchObject({
    tweets: [],
    nextOffset: null,
  })
})

test('reads published digest stories and source links without generation', async () => {
  const { body } = await call('get_digest', {
    date: '2026-10-12',
    query: 'archive',
  })
  expect(getPublishedDigest).toHaveBeenCalledWith('2026-10-12', {
    strict: true,
  })
  expect(body.result?.structuredContent).toMatchObject({
    digest: {
      date: '2026-10-12',
      summary: ['The published summary.'],
      stories: [
        {
          relevant: true,
          href: 'https://www.community-archive.org/digest/2026-10-12/archive',
          tweets: [{ id: tweet.tweetId }],
        },
      ],
    },
  })
})

test.each(['draft', 'archived', 'preview'])(
  'withholds %s digest content',
  async (status) => {
    jest.mocked(getPublishedDigest).mockResolvedValue({
      ...edition,
      status: status === 'preview' ? 'published' : status,
      isPreview: status === 'preview',
    } as DigestEdition)
    expect((await call('get_digest')).body.result?.structuredContent).toEqual({
      digest: null,
    })
  },
)

test.each([
  ['get_tweet', { tweet_id: 2085473085399150817 }],
  ['get_tweet', { tweet_id: '123', extra: true }],
  ['search_tweets', { query: 'archive', limit: 51 }],
  ['search_tweets', { query: 'archive', offset: 5001 }],
  ['search_tweets', { query: 'archive', since: '2026-02-30' }],
  [
    'search_tweets',
    { query: 'archive', since: '2026-10-12', until: '2026-01-01' },
  ],
  ['get_profile', { identifier: '../private' }],
  ['get_bangers', { username: 'alice', period: 'week' }],
  ['get_digest', { date: '2026-02-30' }],
])('rejects invalid %s inputs before reading data', async (name, args) => {
  const { body } = await call(name as string, args as Record<string, unknown>)
  expect(body.result?.isError).toBe(true)
  expect(fetchAnalyticsGatewayJson).not.toHaveBeenCalled()
  expect(resolveProfileCore).not.toHaveBeenCalled()
  expect(getPortalBangersPage).not.toHaveBeenCalled()
  expect(getPublishedDigest).not.toHaveBeenCalled()
})

test('checks current opt-outs for the tweet author and quoted author', async () => {
  jest.mocked(getAppPolicy).mockResolvedValue({
    blocked: new Set(['bob']),
    blockedIds: new Set(),
    members: new Set(),
  })
  const first = (await call('get_tweet', { tweet_id: tweet.tweetId })).body
    .result
  expect(first?.structuredContent).toMatchObject({
    tweet: { quote_tweet_id: null },
  })
  expect(JSON.stringify(first)).not.toContain('Quoted & complete')
  jest.mocked(getAppPolicy).mockResolvedValue({
    blocked: new Set(),
    blockedIds: new Set(['10']),
    members: new Set(),
  })
  expect(
    (await call('get_tweet', { tweet_id: tweet.tweetId })).body.result
      ?.structuredContent,
  ).toEqual({ tweet: null })
})

test('filters blocked sources from cached Bangers and digest results', async () => {
  jest.mocked(getAppPolicy).mockResolvedValue({
    blocked: new Set(['alice']),
    blockedIds: new Set(),
    members: new Set(),
  })
  expect(
    (await call('get_bangers')).body.result?.structuredContent,
  ).toMatchObject({ tweets: [] })
  expect(
    (await call('get_digest')).body.result?.structuredContent,
  ).toMatchObject({ digest: { stories: [{ tweets: [] }] } })
})

test.each(['upstream', 'policy'])(
  'reports a safe tool error on %s failure',
  async (source) => {
    const failure = new Error(
      'Private token SECRET and internal service details',
    )
    if (source === 'upstream')
      jest.mocked(fetchAnalyticsGatewayJson).mockRejectedValue(failure)
    else jest.mocked(getAppPolicy).mockRejectedValue(failure)
    const { body } = await call('get_tweet', { tweet_id: tweet.tweetId })
    expect(body.result?.isError).toBe(true)
    expect(JSON.stringify(body)).not.toContain('SECRET')
    expect(body.result?.structuredContent).toBeUndefined()
  },
)

test.each([
  'https://other.example',
  'null',
  'https://www.community-archive.org/path',
])('rejects the Origin value %s', async (origin) => {
  const { response } = await rpc('tools/list', {}, { origin })
  expect(response.status).toBe(403)
})

test('accepts the site Origin and rejects invalid JSON', async () => {
  expect(
    (
      await rpc(
        'tools/list',
        {},
        { origin: 'https://www.community-archive.org' },
      )
    ).response.status,
  ).toBe(200)
  const response = await POST(
    new Request(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: '{invalid',
    }),
  )
  expect(response.status).toBe(400)
})

test('uses the public Host when Next.js has an internal request URL', async () => {
  const response = await POST(
    new Request('http://localhost:3100/api/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        host: '127.0.0.1:3100',
        origin: 'http://127.0.0.1:3100',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    }),
  )
  expect(response.status).toBe(200)
  await response.text()
})

test.each([GET, DELETE])(
  'rejects unsupported session methods',
  async (handler) => {
    const response = await handler(
      new Request(endpoint, { method: handler === GET ? 'GET' : 'DELETE' }),
    )
    expect(response.status).toBe(405)
    await response.text()
  },
)
