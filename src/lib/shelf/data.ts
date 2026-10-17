import 'server-only'
import { createHash } from 'crypto'
import { revalidatePath, revalidateTag, unstable_cache } from 'next/cache'
import { createServerServiceRoleClient } from '@/utils/supabase'
import { fetchClickHouseTweetPageData } from '@/lib/clickhouseTweetPage'
import type { PortalTweet } from '@/lib/portal/types'
import type { TweetData } from '@/lib/tweets/types'
import { ACCOUNT_ID_PATTERN, shapeShelf, type ShelfDbRow } from './shape'
import type { Shelf, ShelfDecision } from './types'

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
    ['shelf-public-v1', accountId],
    { revalidate: 300, tags: [shelfTag(accountId)] },
  )()
const cachedOwnerRows = (accountId: string) =>
  unstable_cache(
    () => readShelfRows(accountId, true),
    ['shelf-owner-v1', accountId],
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
