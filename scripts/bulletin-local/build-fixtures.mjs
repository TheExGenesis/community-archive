// Builds fixtures.json for the local Bulletin preview from the offering-board
// prototype output (prototypes/offering-board/data/offers.json), which was
// produced from real archive tweets, plus the archive Parquet dump next to it
// (prototypes/offering-board/data/dump/*.parquet, read by
// build-fixtures-real.py through DuckDB). Run once, or again after editing the
// selection below:
//
//   node scripts/bulletin-local/build-fixtures.mjs
//
// The output holds what the mock gateway serves:
//   notices        StoredNotice rows (board state), content_hash = sha256(text)
//   sources        ClickHouse `bulletin-sources` / `tweet/<id>` rows by tweet id;
//                  created_at, likes/retweets, replies/quotes/reply_account_ids
//                  and account_created_at come from the dump when the tweet is
//                  in it (offers.json posted_at runs four hours ahead of the
//                  archive's created_at)
//   interactions   the viewer's real top-25 outgoing interactions (replies +
//                  quotes by target account) from the dump
//   relationships  the viewer's following/followers account ids from members'
//                  own archive uploads (offers.json authors.*.followers/following)
//   threads        archived replies under each notice, two levels deep, from
//                  the dump, joined to profiles
//
// The four notices with tweet ids starting 9000… are synthetic and belong to
// the "me" account so the You badge, renewals and personal stats show up; they
// have no dump rows, so the mock keeps serving synthetic replies for them.
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = resolve(here, '../../prototypes/offering-board/data/offers.json')
const target = resolve(here, 'fixtures.json')
const dump = resolve(here, '../../prototypes/offering-board/data/dump')
const realScript = resolve(here, 'build-fixtures-real.py')

const ME = {
  account_id: '815615492429754369',
  username: 'maskys_',
  display_name: 'Kifah (will eye ⏿ for storms 🌪️)',
  avatar_url:
    'https://pbs.twimg.com/profile_images/2078670737095741440/Fif02N4T_normal.jpg',
}
// newest / oldest per kind+side. Oldest rows give the "past" state naturally:
// asks expire after 14 days, offers after 60, unless standing.
const PLAN = {
  'help/offer': [12, 4],
  'help/ask': [12, 4],
  'feedback/offer': [4, 0],
  'feedback/ask': [4, 0],
  'intro/ask': [10, 4],
  'intro/offer': [8, 2],
  'free/offer': [10, 3],
  'invite/offer': [12, 4],
  'invite/ask': [2, 0],
  'opportunity/offer': [10, 3],
  'opportunity/ask': [8, 3],
}

const proto = JSON.parse(readFileSync(source, 'utf8'))
const byHandle = new Map(proto.members.map((m) => [m[1].toLowerCase(), m]))
const sha = (text) => createHash('sha256').update(text).digest('hex')
const utc = (value) => new Date(value).toISOString()
const evidence = (text) => text.replace(/\s+/g, ' ').trim().slice(0, 140)

function convert(n) {
  const member = byHandle.get(n.author.handle.toLowerCase())
  if (!member) return null
  const tenure = proto.authors?.[n.author.handle]?.tenure
  const replyIds = (n.uptake?.repliers || [])
    .map((i) => proto.members[i]?.[0])
    .filter(Boolean)
  return {
    notice: {
      tweet_id: n.id.replace(/^x:/, ''),
      account_id: member[0],
      username: member[1],
      posted_at: utc(n.posted_at),
      side: n.side,
      kind: n.kind,
      summary: n.summary,
      evidence: evidence(n.text),
      topics: n.topics || [],
      respond: n.respond || 'unknown',
      standing: !!n.standing,
      expires_at: n.expires_at || null,
      place: n.place || null,
      content_hash: sha(n.text),
    },
    source: {
      tweet_id: n.id.replace(/^x:/, ''),
      account_id: member[0],
      full_text: n.text,
      reply_to_tweet_id: null,
      retweet: false,
      created_at: utc(n.posted_at),
      username: member[1],
      display_name: n.author.name || member[2] || member[1],
      account_created_at: tenure ? `${tenure}-01-01T00:00:00Z` : null,
      avatar_url: n.author.avatar || null,
      replies: n.uptake?.replies || 0,
      quotes: n.uptake?.quotes || 0,
      reply_account_ids: replyIds,
      renewed_at: null,
      likes: n.likes || 0,
      retweets: 0,
      content_hash: sha(n.text),
    },
  }
}

const groups = new Map()
for (const n of proto.notices) {
  // Notices need an account id, which only the member list provides.
  if (!byHandle.has(n.author.handle.toLowerCase())) continue
  const key = `${n.kind}/${n.side}`
  if (!groups.has(key)) groups.set(key, [])
  groups.get(key).push(n)
}
const picked = []
for (const [key, [newest, oldest]] of Object.entries(PLAN)) {
  const rows = (groups.get(key) || [])
    .slice()
    .sort((a, b) => Date.parse(b.posted_at) - Date.parse(a.posted_at))
  const chosen = [
    ...rows.slice(0, newest),
    ...(oldest ? rows.slice(-oldest) : []),
  ]
  for (const n of new Set(chosen)) picked.push(n)
}
// Always keep the viewer's own real notice.
for (const n of proto.notices)
  if (n.author.handle === ME.username && !picked.includes(n)) picked.push(n)

const converted = picked.map(convert).filter(Boolean)

// Synthetic notices for the "me" account. Tweet ids beginning 9000 never
// collide with real snowflake ids from the archive.
function mine(id, fields, text, extra = {}) {
  const posted = utc(fields.posted_at)
  return {
    notice: {
      tweet_id: id,
      account_id: ME.account_id,
      username: ME.username,
      posted_at: posted,
      side: fields.side,
      kind: fields.kind,
      summary: fields.summary,
      evidence: evidence(text),
      topics: fields.topics,
      respond: fields.respond,
      standing: !!fields.standing,
      expires_at: fields.expires_at || null,
      place: fields.place || null,
      content_hash: sha(text),
    },
    source: {
      tweet_id: id,
      account_id: ME.account_id,
      full_text: text,
      reply_to_tweet_id: null,
      retweet: false,
      created_at: posted,
      username: ME.username,
      display_name: ME.display_name,
      account_created_at: '2017-01-01T00:00:00Z',
      avatar_url: ME.avatar_url,
      replies: extra.replies || 0,
      quotes: extra.quotes || 0,
      reply_account_ids: extra.reply_account_ids || [],
      renewed_at: extra.renewed_at ? utc(extra.renewed_at) : null,
      likes: extra.likes || 0,
      retweets: 0,
      content_hash: sha(text),
      synthetic: true,
    },
  }
}
const others = converted
  .map((c) => c.notice.account_id)
  .filter((id) => id !== ME.account_id)
converted.push(
  mine(
    '900000000000000001',
    {
      side: 'ask',
      kind: 'help',
      posted_at: '2026-09-05T14:10:00Z',
      summary:
        'Help speeding up a DuckDB window-function query over the archive dump, in exchange for a Roam onboarding session.',
      topics: ['duckdb', 'sql', 'archive dump'],
      respond: 'reply',
    },
    'ask: anyone here fluent in DuckDB window functions? computing tenure buckets over 10M archive rows takes 40 minutes and I am sure it is my query, not the machine. will trade a Roam onboarding session.',
    { replies: 3, likes: 7, reply_account_ids: others.slice(0, 3) },
  ),
  mine(
    '900000000000000002',
    {
      side: 'offer',
      kind: 'feedback',
      posted_at: '2026-08-20T09:30:00Z',
      summary:
        'A blunt written UX critique of any Community Archive tool or prototype, five bullets within a week.',
      topics: ['ux', 'critique', 'community archive'],
      respond: 'dm',
      standing: true,
    },
    'standing offer: I will give a blunt written UX critique of any community archive tool or prototype. send a link, get five bullets back within a week. no charge, I just like doing it.',
    { replies: 1, quotes: 1, likes: 12, reply_account_ids: others.slice(3, 4) },
  ),
  mine(
    '900000000000000003',
    {
      side: 'ask',
      kind: 'intro',
      posted_at: '2026-09-07T18:45:00Z',
      summary:
        'An intro to someone who has run a small grants program for open-source community tooling.',
      topics: ['grants', 'open source', 'intro'],
      respond: 'dm',
      expires_at: '2026-09-25',
    },
    'ask: looking for an intro to someone who has run a small grants program (under $50k total) for open-source community tooling. I want to copy their application form, not their money. closing this on the 25th.',
    { likes: 4 },
  ),
  mine(
    '900000000000000004',
    {
      side: 'offer',
      kind: 'invite',
      posted_at: '2026-06-10T16:00:00Z',
      summary:
        'A monthly 30-minute archive builders call on the second Thursday; bring something half-working.',
      topics: ['community call', 'builders', 'monthly'],
      respond: 'link',
      place: 'online',
    },
    'offer: monthly archive builders call, second thursday, 30 minutes, bring a half-working thing and leave with two people who want to see it work. link in bio, renewed each month.',
    {
      replies: 5,
      quotes: 2,
      likes: 19,
      renewed_at: '2026-09-04T12:00:00Z',
      reply_account_ids: others.slice(4, 9),
    },
  ),
)

// Follow lists from members' own uploads. authors.<handle>.followers /
// following are indices into members. The viewer's own lists come first; other
// authors' lists pointing at the viewer fill in (an author whose `following`
// has the viewer is a follower of the viewer, and vice versa).
function relationships() {
  const meIndex = proto.members.findIndex(
    (m) => m[1].toLowerCase() === ME.username.toLowerCase(),
  )
  const id = (index) => proto.members[index]?.[0]
  const following = new Set()
  const followers = new Set()
  const own = proto.authors?.[ME.username] || {}
  for (const i of own.following || []) if (id(i)) following.add(id(i))
  for (const i of own.followers || []) if (id(i)) followers.add(id(i))
  for (const [handle, author] of Object.entries(proto.authors || {})) {
    const member = byHandle.get(handle.toLowerCase())
    if (!member || member[0] === ME.account_id || meIndex < 0) continue
    if (author.following?.includes(meIndex)) followers.add(member[0])
    if (author.followers?.includes(meIndex)) following.add(member[0])
  }
  const sort = (set) => [...set].sort((a, b) => a.localeCompare(b))
  return { following: sort(following), followers: sort(followers) }
}

// Numbers only the dump has: outgoing interactions, engagement, uptake,
// archived reply threads and profile facts. Runs the DuckDB script with uv.
function fromDump() {
  if (!existsSync(resolve(dump, 'tweets.parquet'))) {
    console.warn(`no ${dump}/tweets.parquet; skipping dump-derived fields`)
    return null
  }
  const request = {
    me: ME.account_id,
    notice_ids: converted
      .map((c) => c.source.tweet_id)
      .filter((id) => !id.startsWith('9000')),
    author_ids: [...new Set(converted.map((c) => c.source.account_id))],
  }
  const run = spawnSync(
    'uv',
    ['run', '--with', 'duckdb', 'python3', realScript],
    {
      cwd: resolve(here, '../..'),
      input: JSON.stringify(request),
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    },
  )
  if (run.status !== 0) {
    console.error(run.stderr)
    throw new Error(`build-fixtures-real.py exited with ${run.status}`)
  }
  return JSON.parse(run.stdout)
}

const real = fromDump()
const diffs = []
if (real) {
  for (const { notice, source } of converted) {
    if (source.synthetic) continue
    const stats = real.engagement[source.tweet_id]
    if (stats) {
      source.likes = stats.favorite_count
      source.retweets = stats.retweet_count
      if (stats.created_at) {
        source.created_at = stats.created_at
        notice.posted_at = stats.created_at
      }
    }
    const profile = real.profiles[source.account_id]
    if (profile?.account_created_at)
      source.account_created_at = profile.account_created_at
    if (!source.avatar_url && profile?.avatar_media_url)
      source.avatar_url = profile.avatar_media_url
    // Uptake is recomputed only for tweets the dump has; notices posted after
    // the export keep the offers.json figures (which came from an older dump).
    if (!stats) continue
    const uptake = real.uptake[source.tweet_id] || {
      replies: 0,
      replies_including_self: 0,
      quotes: 0,
      reply_account_ids: [],
    }
    const before = {
      replies: source.replies,
      quotes: source.quotes,
      ids: source.reply_account_ids.length,
    }
    source.replies = uptake.replies
    source.quotes = uptake.quotes
    source.reply_account_ids = uptake.reply_account_ids
    if (
      before.replies !== uptake.replies ||
      before.quotes !== uptake.quotes ||
      before.ids !== uptake.reply_account_ids.length
    )
      diffs.push({
        tweet_id: source.tweet_id,
        offers: before,
        dump: {
          replies: uptake.replies,
          replies_including_self: uptake.replies_including_self,
          quotes: uptake.quotes,
          ids: uptake.reply_account_ids.length,
        },
      })
  }
}

const fixtures = {
  generated_from: [
    'prototypes/offering-board/data/offers.json',
    ...(real
      ? [
          'prototypes/offering-board/data/dump/tweets.parquet',
          'prototypes/offering-board/data/dump/profiles.parquet',
        ]
      : []),
  ],
  me: { account_id: ME.account_id, username: ME.username },
  notices: converted.map((c) => c.notice),
  sources: Object.fromEntries(
    converted.map((c) => [c.source.tweet_id, c.source]),
  ),
  interactions: { [ME.account_id]: real?.interactions || [] },
  relationships: relationships(),
  threads: real?.threads || {},
}
writeFileSync(target, JSON.stringify(fixtures, null, 2) + '\n')
const tally = {}
for (const { notice } of converted) {
  const k = `${notice.kind}/${notice.side}`
  tally[k] = (tally[k] || 0) + 1
}
console.log(`wrote ${converted.length} notices to ${target}`)
console.log(tally)
if (real) {
  const withThreads = Object.keys(fixtures.threads).length
  const replyRows = Object.values(fixtures.threads).reduce(
    (n, list) => n + list.length,
    0,
  )
  const inDump = Object.keys(real.engagement).length
  console.log(
    `dump: ${inDump}/${converted.length - 4} real notices found, ${withThreads} with archived replies (${replyRows} reply rows), ` +
      `${fixtures.interactions[ME.account_id].length} outgoing interactions, ` +
      `following ${fixtures.relationships.following.length} / followers ${fixtures.relationships.followers.length}`,
  )
  if (diffs.length) {
    console.log(`uptake differs from offers.json for ${diffs.length} notices:`)
    for (const d of diffs) console.log(' ', JSON.stringify(d))
  }
}
