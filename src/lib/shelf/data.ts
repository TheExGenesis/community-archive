import 'server-only'
import { createHash } from 'crypto'
import { revalidatePath, revalidateTag, unstable_cache } from 'next/cache'
import { createServerServiceRoleClient } from '@/utils/supabase'
import { fetchClickHouseTweetPageData } from '@/lib/clickhouseTweetPage'
import type { PortalTweet } from '@/lib/portal/types'
import type { TweetData } from '@/lib/tweets/types'
import { ACCOUNT_ID_PATTERN, shapeShelf, type ShelfDbRow } from './shape'
import type { Shelf, ShelfDecision, ShelfPerson } from './types'

export const SHELF_EVIDENCE_LIMIT = 12
export const COVER_KEY_PATTERN = /^[0-9a-f]{32}$/

export const shelfCoverKey = (value: string) =>
  createHash('sha256').update(value).digest('hex').slice(0, 32)

const shelfTag = (accountId: string) => `shelf:${accountId}`

async function readShelfRows(
  accountId: string,
  includeUnapproved: boolean,
): Promise<ShelfDbRow[]> {
  if (!ACCOUNT_ID_PATTERN.test(accountId)) return []
  const { data, error } = await createServerServiceRoleClient().rpc(
    'get_shelf',
    { p_account_id: accountId, include_unapproved: includeUnapproved },
  )
  // Throwing keeps failures out of the data cache; callers decide the fallback.
  if (error) throw new Error('Shelf could not be loaded')
  return data ?? []
}

// get_shelf already returns approved, unchanged items to public callers; the
// filter keeps a contract drift from publishing anything else.
const approvedOnly = (rows: ShelfDbRow[]) =>
  rows.filter((row) => row.status === 'approved')

// Both views are tagged per account and invalidated on every curation write.
// The owner view is short-lived because the worker rebuilds items without
// touching the web cache.
const cachedPublicRows = (accountId: string) =>
  unstable_cache(
    () => readShelfRows(accountId, false),
    ['shelf-public-v3', accountId],
    { revalidate: 300, tags: [shelfTag(accountId)] },
  )()
const cachedOwnerRows = (accountId: string) =>
  unstable_cache(
    () => readShelfRows(accountId, true),
    ['shelf-owner-v3', accountId],
    { revalidate: 60, tags: [shelfTag(accountId)] },
  )()

/** Approved items only, for anyone. */
export async function getPublicShelf(accountId: string): Promise<Shelf> {
  return shapeShelf(
    accountId,
    approvedOnly(await cachedPublicRows(accountId)),
    shelfCoverKey,
  )
}

/**
 * Remote image URLs of approved works, by work key. Server-rendered share
 * cards only: pages get same-origin proxy paths and never see these.
 */
export async function getPublicShelfImageUrls(
  accountId: string,
): Promise<Record<string, string>> {
  return Object.fromEntries(
    approvedOnly(await cachedPublicRows(accountId)).flatMap((row) =>
      row.image_url && /^https:\/\//i.test(row.image_url)
        ? [[row.work_key, row.image_url]]
        : [],
    ),
  )
}

/** Every item including pending and hidden. Caller must authorize the owner. */
export async function getOwnerShelf(accountId: string): Promise<Shelf> {
  return shapeShelf(accountId, await cachedOwnerRows(accountId), shelfCoverKey)
}

/**
 * Find one item by its cover key. Approved items are served from the public
 * view; `ownerView` is consulted only when the caller has authorized the owner.
 */
export async function findShelfRow(
  accountId: string,
  key: string,
  ownerView: () => Promise<boolean>,
): Promise<{ row: ShelfDbRow; isPublic: boolean } | null> {
  if (!ACCOUNT_ID_PATTERN.test(accountId) || !COVER_KEY_PATTERN.test(key))
    return null
  const match = (rows: ShelfDbRow[]) =>
    rows.find((row) => shelfCoverKey(row.work_key) === key)
  const approved = match(approvedOnly(await cachedPublicRows(accountId)))
  if (approved) return { row: approved, isPublic: true }
  if (!(await ownerView())) return null
  const owned = match(await cachedOwnerRows(accountId))
  return owned ? { row: owned, isPublic: false } : null
}

async function readPeople(ids: string[]): Promise<ShelfPerson[]> {
  if (!ids.length) return []
  const { data, error } = await createServerServiceRoleClient()
    .from('user_directory')
    .select('account_id, username, account_display_name, avatar_media_url')
    .in('account_id', ids)
  if (error) throw new Error('Members could not be loaded')
  const found = new Map<string, ShelfPerson>()
  for (const row of data ?? []) {
    if (!row.account_id || !row.username || found.has(row.account_id)) continue
    found.set(row.account_id, {
      accountId: row.account_id,
      username: row.username,
      name: row.account_display_name,
      avatar: row.avatar_media_url,
    })
  }
  return ids.flatMap((id) => found.get(id) ?? [])
}

/**
 * Names and avatars for the faces drawn next to works. Unknown ids are
 * dropped rather than drawn as blank faces. Cached with the shelf.
 */
export async function getShelfPeople(
  accountId: string,
  ids: string[],
): Promise<ShelfPerson[]> {
  const wanted = Array.from(
    new Set(ids.filter((id) => ACCOUNT_ID_PATTERN.test(id))),
  ).sort()
  if (!wanted.length) return []
  const digest = createHash('sha256').update(wanted.join(',')).digest('hex')
  return unstable_cache(() => readPeople(wanted), ['shelf-people-v1', digest], {
    revalidate: 3600,
    tags: [shelfTag(accountId)],
  })()
}

export const SHELF_ECHO_TWEETS = 12

/**
 * Who else tweeted about one work, and one tweet from each of the first
 * dozen of them, newest first. Rows come from get_shelf_echoes, which keeps
 * current members only; a tweet whose author is not that member is dropped.
 */
export async function getShelfEchoes(
  accountId: string,
  workKey: string,
  fetchTweet = fetchClickHouseTweetPageData,
): Promise<{
  people: ShelfPerson[]
  tweets: (PortalTweet & { match: 'url' | 'title' })[]
  total: number
  failed: boolean
}> {
  const { data, error } = await createServerServiceRoleClient().rpc(
    'get_shelf_echoes',
    { p_account_id: accountId, p_work_key: workKey },
  )
  if (error) throw new Error('Echoes could not be loaded')
  const rows = (data ?? []).filter(
    (row) =>
      ACCOUNT_ID_PATTERN.test(row.other_account_id) &&
      row.other_account_id !== accountId,
  )
  const people = await getShelfPeople(
    accountId,
    rows.map((row) => row.other_account_id),
  )
  const picks = rows
    .slice(0, SHELF_ECHO_TWEETS)
    .flatMap((row) => {
      const id = row.tweet_ids.find((t) => /^\d{1,20}$/.test(t))
      return id ? [{ id, author: row.other_account_id, match: row.match }] : []
    })
  const tweets: (PortalTweet & { match: 'url' | 'title' })[] = []
  let errors = 0
  for (let offset = 0; offset < picks.length; offset += 4) {
    const batch = await Promise.all(
      picks.slice(offset, offset + 4).map((pick) =>
        fetchTweet(pick.id)
          .then((tweet) => ({ pick, tweet }))
          .catch(() => {
            errors += 1
            return { pick, tweet: null }
          }),
      ),
    )
    for (const { pick, tweet } of batch)
      if (tweet && tweet.account_id === pick.author)
        tweets.push({
          ...portalTweet(tweet),
          match: pick.match === 'url' ? 'url' : 'title',
        })
  }
  tweets.sort(
    (a, b) => b.id.length - a.id.length || b.id.localeCompare(a.id),
  )
  return {
    people,
    tweets,
    total: rows.length,
    failed: picks.length > 0 && errors === picks.length,
  }
}

/** Tweet text as a quote: no links, no leading @replies, entities decoded. */
export function quoteText(text: string) {
  return text
    .replace(/https?:\/\/\S+/g, '')
    .replace(/^(?:@\w+\s+)+/, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}

/** A quote in the member's own words, with the tweet's first photo when it has one. */
export type ShelfOwnQuote = { text: string; image: string | null }

/** The first photo attached to a tweet, from Twitter's media CDN only. */
function tweetPhoto(tweet: TweetData) {
  const photo = (tweet.media ?? []).find((m) => m.media_type === 'photo')
  if (!photo?.media_url) return null
  try {
    const url = new URL(photo.media_url)
    return url.protocol === 'https:' && url.hostname === 'pbs.twimg.com' ? url.toString() : null
  } catch {
    return null
  }
}

/**
 * The member's own words about one work: the newest of its two newest tweets
 * that says something beyond a link or an @reply. Throws when every read
 * failed, so an outage is not cached as "no quote".
 */
async function readOwnQuote(
  accountId: string,
  workKey: string,
  tweetIds: string[],
  fetchTweet: typeof fetchClickHouseTweetPageData,
): Promise<[string, ShelfOwnQuote] | null> {
  const ids = tweetIds
    .filter((id) => /^\d{1,20}$/.test(id))
    .sort((a, b) => b.length - a.length || b.localeCompare(a))
    .slice(0, 2)
  let failures = 0
  for (const id of ids) {
    const tweet = await fetchTweet(id).catch(() => {
      failures += 1
      return null
    })
    const text = tweet?.account_id === accountId ? quoteText(tweet.full_text ?? '') : ''
    if (tweet && text.length >= 12) return [workKey, { text, image: tweetPhoto(tweet) }]
  }
  if (ids.length && failures === ids.length) throw new Error('Tweets are unavailable')
  return null
}

export const SHELF_QUOTE_LIMIT = 16

/**
 * One line in the member's own words for the tiles that show a quote
 * (conversation tiles and larger tiles without a cover), four reads at a
 * time. A work without a usable tweet gets no quote. Cached with the shelf.
 */
export async function getOwnQuotes(
  accountId: string,
  works: { workKey: string; evidenceTweetIds: string[] }[],
  fetchTweet = fetchClickHouseTweetPageData,
): Promise<Record<string, ShelfOwnQuote>> {
  const picked = works.slice(0, SHELF_QUOTE_LIMIT)
  if (!picked.length) return {}
  const digest = createHash('sha256')
    .update(picked.map((w) => `${w.workKey}|${w.evidenceTweetIds.join(',')}`).sort().join('\n'))
    .digest('hex')
  return unstable_cache(
    async () => {
      const out: Record<string, ShelfOwnQuote> = {}
      let down = 0
      for (let offset = 0; offset < picked.length; offset += 4) {
        const batch = await Promise.all(
          picked.slice(offset, offset + 4).map((w) =>
            readOwnQuote(accountId, w.workKey, w.evidenceTweetIds, fetchTweet).catch(() => {
              down += 1
              return null
            }),
          ),
        )
        for (const entry of batch) if (entry) out[entry[0]] = entry[1]
      }
      // A tweet-source outage must not be cached as "no quotes" for an hour.
      if (down === picked.length) throw new Error('Tweets are unavailable')
      return out
    },
    ['shelf-own-quotes-v2', accountId, digest],
    { revalidate: 3600, tags: [shelfTag(accountId)] },
  )()
}

export class ShelfCurationError extends Error {
  constructor(
    readonly kind: 'invalid' | 'forbidden' | 'unavailable',
    message: string,
  ) {
    super(message)
  }
}

/**
 * Apply an owner decision. `pending` clears the decision; `approved` records
 * the item's current content, so a later change sends it back to review. A title applies to
 * exactly one work; an empty title restores the generated label. The status is
 * always written, so a rename must pass the item's current status.
 * Callers must verify ownership first (see canCurateShelf).
 */
export async function setShelfCuration(
  accountId: string,
  workKeys: string[],
  status: ShelfDecision,
  title?: string | null,
): Promise<number> {
  const { data, error } = await createServerServiceRoleClient().rpc(
    'set_shelf_curation',
    {
      p_account_id: accountId,
      p_work_keys: workKeys,
      // SQL NULL means "pending" / "keep title"; generated types omit nullability.
      p_status: (status === 'pending' ? null : status) as string,
      p_title: (title === undefined ? null : title) as string,
    },
  )
  if (error) {
    if (error.code === '22023')
      throw new ShelfCurationError('invalid', 'Invalid shelf change')
    if (error.code === '42501')
      throw new ShelfCurationError('forbidden', 'Not a current member')
    throw new ShelfCurationError('unavailable', 'Shelf change not saved')
  }
  revalidateTag(shelfTag(accountId))
  revalidatePath('/shelf')
  revalidatePath('/user/[account_id]/shelf', 'page')
  return data ?? 0
}

function portalTweet(tweet: TweetData): PortalTweet {
  const media = (items: TweetData['media'] | undefined) =>
    (items ?? []).map((m) => ({
      url: m.media_url,
      type: m.media_type,
      width: m.width,
      height: m.height,
    }))
  const quoted = tweet.quoted_tweet
  return {
    id: tweet.tweet_id,
    accountId: tweet.account_id,
    username: tweet.username,
    name: tweet.account_display_name,
    avatar: tweet.avatar_media_url || null,
    text: tweet.full_text,
    createdAt: tweet.created_at,
    observedAt: tweet.created_at,
    likes: tweet.favorite_count || 0,
    rts: tweet.retweet_count ?? 0,
    retweetCountAvailable: tweet.retweet_count !== null,
    media: media(tweet.media),
    quotedTweet: quoted
      ? {
          id: quoted.tweet_id,
          accountId: quoted.account_id,
          username: quoted.username,
          name: quoted.account_display_name,
          avatar: quoted.avatar_media_url || null,
          text: quoted.full_text,
          createdAt: quoted.created_at,
          likes: quoted.favorite_count || 0,
          rts: quoted.retweet_count ?? 0,
          media: media(quoted.media),
          isDeleted: quoted.is_deleted,
        }
      : undefined,
  }
}

/**
 * Hydrate an item's source tweets from the same ClickHouse record source as
 * /tweets/:id, newest first, four at a time. Tweets that fail or belong to
 * another account are skipped; `failed` reports a total outage so callers can
 * return a non-cacheable error instead of an empty list.
 */
export async function getShelfEvidence(
  accountId: string,
  tweetIds: string[],
  fetchTweet = fetchClickHouseTweetPageData,
): Promise<{ tweets: PortalTweet[]; total: number; failed: boolean }> {
  const valid = Array.from(
    new Set(tweetIds.filter((id) => /^\d{1,20}$/.test(id))),
  )
  const ids = [...valid]
    // Tweet ids grow with time: longer, then lexically larger, is newer.
    .sort((a, b) => b.length - a.length || b.localeCompare(a))
    .slice(0, SHELF_EVIDENCE_LIMIT)
  const tweets: PortalTweet[] = []
  let errors = 0
  for (let offset = 0; offset < ids.length; offset += 4) {
    const batch = await Promise.all(
      ids.slice(offset, offset + 4).map((id) =>
        fetchTweet(id).catch(() => {
          errors += 1
          return null
        }),
      ),
    )
    for (const tweet of batch)
      if (tweet && tweet.account_id === accountId)
        tweets.push(portalTweet(tweet))
  }
  return {
    tweets,
    total: valid.length,
    failed: ids.length > 0 && errors === ids.length,
  }
}
