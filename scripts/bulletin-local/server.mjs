// Local stand-in for the two remote dependencies of /opportunities: the
// Supabase board state (served for BULLETIN_LOCAL_BOARD_PREVIEW_URL) and the
// ClickHouse analytics gateway (served for CLICKHOUSE_ANALYTICS_API_URL).
// Loopback only. Reads fixtures.json next to this file. No writes anywhere.
//
//   node scripts/bulletin-local/server.mjs            # 127.0.0.1:4785
//   BULLETIN_LOCAL_MOCK_PORT=4790 node scripts/bulletin-local/server.mjs
//
// Routes
//   GET /board                               -> { notices, allowedAccounts }
//   GET /runs                                -> RunDashboard for the admin page
//   GET /gateway/bulletin-sources?ids=&enrich= -> { data: [source rows] }
//   GET /gateway/user/<id|handle>/interactions?limit=25
//   GET /gateway/tweet/<id>                  -> { data: { tweet, quotedTweet } }
//   GET /gateway/tweet/<id>/thread           -> { data: { tweet, conversationTweets } }
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.BULLETIN_LOCAL_MOCK_PORT || 4785)
const TOKEN =
  process.env.CLICKHOUSE_ANALYTICS_API_TOKEN || 'local-preview-token'
const FIXTURES =
  process.env.BULLETIN_LOCAL_FIXTURES || resolve(here, 'fixtures.json')

function load() {
  // Re-read on every request so fixture edits show up without a restart.
  return JSON.parse(readFileSync(FIXTURES, 'utf8'))
}

function detail(source) {
  return {
    tweetId: source.tweet_id,
    accountId: source.account_id,
    createdAt: source.created_at,
    fullText: source.full_text,
    replyToTweetId: source.reply_to_tweet_id,
    replyToUsername: null,
    favoriteCount: source.likes || 0,
    retweetCount: source.retweets || 0,
    username: source.username,
    accountDisplayName: source.display_name,
    avatarMediaUrl: source.avatar_url,
    media: source.media || [],
    quoteTweetId: null,
    retweetedTweetId: null,
  }
}

function json(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

const server = createServer((req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`)
  const path = url.pathname.replace(/\/+$/, '')
  const started = Date.now()
  res.on('finish', () =>
    console.log(
      `[mock] ${res.statusCode} ${req.method} ${url.pathname}${url.search} ${Date.now() - started}ms`,
    ),
  )
  if (req.method !== 'GET') return json(res, 405, { error: 'GET only' })
  const fixtures = load()

  if (path === '/board')
    return json(res, 200, { notices: fixtures.notices, allowedAccounts: [] })
  if (path === '/relationships') {
    // Deterministic follow lists from fixture authors: first 30 followed,
    // authors 15-44 follow back, so 15 are mutual.
    const me = fixtures.me?.account_id
    const authors = []
    for (const n of fixtures.notices || [])
      if (
        n.account_id &&
        n.account_id !== me &&
        !authors.includes(n.account_id)
      )
        authors.push(n.account_id)
    return json(res, 200, {
      following: authors.slice(0, 30),
      followers: authors.slice(15, 45),
    })
  }
  if (path === '/runs')
    return json(res, 200, {
      preview_note: 'Local fixture. No scans run in this preview.',
      runs: [],
      queue: { pending: 0, retrying: 0, exhausted: 0 },
      last_success_at: null,
    })
  if (path === '/health') return json(res, 200, { ok: true })

  if (!path.startsWith('/gateway/'))
    return json(res, 404, { error: `No route for ${path}` })
  if (req.headers.authorization !== `Bearer ${TOKEN}`)
    return json(res, 401, { error: 'Bad bearer token for local mock' })
  const segments = path.slice('/gateway/'.length).split('/')

  if (segments.length === 1 && segments[0] === 'bulletin-sources') {
    const ids = (url.searchParams.get('ids') || '').split(',').filter(Boolean)
    const data = ids.map((id) => fixtures.sources[id]).filter(Boolean)
    return json(res, 200, { data })
  }
  if (
    segments.length === 3 &&
    segments[0] === 'user' &&
    segments[2] === 'interactions'
  ) {
    const who = decodeURIComponent(segments[1])
    const me = fixtures.me || {}
    const accountId = /^\d{1,20}$/.test(who)
      ? who
      : who.replace(/^@/, '').toLowerCase() ===
          (me.username || '').toLowerCase()
        ? me.account_id
        : null
    if (!accountId) return json(res, 404, { error: 'Unknown account' })
    const limit = Number(url.searchParams.get('limit') || 25)
    return json(res, 200, {
      data: {
        people: (fixtures.interactions?.[accountId] || []).slice(0, limit),
      },
      query: { accountId, year: null, peopleLimit: limit },
    })
  }
  if (segments.length >= 2 && segments[0] === 'tweet') {
    const source = fixtures.sources[segments[1]]
    if (!source) return json(res, 404, { error: 'Tweet not found' })
    if (segments.length === 2)
      return json(res, 200, {
        data: { tweet: detail(source), quotedTweet: null },
      })
    if (segments.length === 3 && segments[2] === 'thread') {
      // Synthetic replies for the preview, one per archived replier id in
      // the fixture (capped at 5), so the expanded card has something to show.
      const byAccount = new Map(
        Object.values(fixtures.sources).map((s) => [s.account_id, s]),
      )
      const texts = [
        'Happy to help with this, sent you a DM.',
        'I know someone who did exactly this last year, intro incoming.',
        'Following along, curious what answers you get.',
        'Tried this a while back. What worked for me was keeping it small first.',
        'Count me in if there is still room.',
      ]
      const conversationTweets = (source.reply_account_ids || [])
        .slice(0, 5)
        .map((accountId, i) => {
          const who = byAccount.get(accountId)
          return {
            tweetId: `${source.tweet_id}0${i}`,
            accountId,
            createdAt: new Date(
              Date.parse(source.created_at) + (i + 1) * 3600e3,
            ).toISOString(),
            fullText: texts[i % texts.length],
            replyToTweetId: source.tweet_id,
            replyToUsername: source.username,
            favoriteCount: (i * 3) % 7,
            retweetCount: 0,
            username: who?.username || `member${i + 1}`,
            accountDisplayName: who?.display_name || `Member ${i + 1}`,
            avatarMediaUrl: who?.avatar_url || null,
            media: [],
            quoteTweetId: null,
            quotedTweet: null,
            retweetedTweetId: null,
          }
        })
      return json(res, 200, {
        data: {
          tweet: { ...detail(source), quotedTweet: null },
          conversationTweets,
        },
      })
    }
  }
  return json(res, 404, { error: `Unmocked gateway endpoint ${path}` })
})

server.listen(PORT, '127.0.0.1', () => {
  const { notices, sources } = load()
  console.log(
    `[mock] bulletin preview on http://127.0.0.1:${PORT} (${notices.length} notices, ${Object.keys(sources).length} sources) from ${FIXTURES}`,
  )
})
