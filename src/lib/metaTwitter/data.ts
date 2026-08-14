import 'server-only'

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import { Database } from '@/database-types'
import { devLog } from '@/lib/devLog'
import type {
  ArchiveTweet,
  ArchiveMediaItem,
  ArchivePerson,
  ProfileHeaderData,
} from './types'

export type {
  ArchiveTweet,
  ArchiveMediaItem,
  ArchivePerson,
  ProfileHeaderData,
}

/**
 * Data layer for the Meta Twitter profile page.
 *
 * Follows the portal pattern (src/lib/portal/data.ts): a cookie-free anon
 * client so aggregates can live inside unstable_cache without opting the
 * route into per-request work.
 */

const getMetaClient = (): SupabaseClient<Database> => {
  const isDevelopment = process.env.NODE_ENV === 'development'
  const useRemoteDevDb = process.env.NEXT_PUBLIC_USE_REMOTE_DEV_DB === 'true'
  const url =
    isDevelopment && !useRemoteDevDb
      ? process.env.NEXT_PUBLIC_LOCAL_SUPABASE_URL!
      : process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anonKey =
    isDevelopment && !useRemoteDevDb
      ? process.env.NEXT_PUBLIC_LOCAL_ANON_KEY!
      : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false },
  })
}

const TWEET_SELECT = `
  tweet_id, account_id, created_at, full_text, favorite_count, retweet_count,
  reply_to_username,
  account:all_account!inner ( username, account_display_name ),
  media:tweet_media ( media_url, media_type, width, height )
`

interface RawTweetRow {
  tweet_id: string
  account_id: string
  created_at: string
  full_text: string
  favorite_count: number
  retweet_count: number | null
  reply_to_username: string | null
  account: { username: string; account_display_name: string | null } | null
  media:
    | { media_url: string; media_type: string; width: number; height: number }[]
    | null
}

const normalizeTweet = (
  row: RawTweetRow,
  avatarUrl: string | null,
): ArchiveTweet => ({
  tweet_id: row.tweet_id,
  account_id: row.account_id,
  created_at: row.created_at,
  full_text: row.full_text,
  favorite_count: row.favorite_count,
  retweet_count: row.retweet_count,
  reply_to_username: row.reply_to_username,
  username: row.account?.username ?? '',
  account_display_name:
    row.account?.account_display_name ?? row.account?.username ?? '',
  avatar_media_url: avatarUrl,
  media: row.media ?? [],
})

async function fetchProfileHeader(
  accountId: string,
): Promise<ProfileHeaderData | null> {
  const supabase = getMetaClient()
  const [{ data: account }, { data: profile }] = await Promise.all([
    supabase
      .from('all_account')
      .select(
        'account_id, username, account_display_name, created_at, num_tweets, num_followers, num_following, num_likes',
      )
      .eq('account_id', accountId)
      .maybeSingle(),
    supabase
      .from('all_profile')
      .select('bio, website, location, avatar_media_url, header_media_url')
      .eq('account_id', accountId)
      .order('archive_upload_id', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  if (!account) return null
  return {
    ...account,
    account_display_name: account.account_display_name ?? account.username,
    bio: profile?.bio ?? null,
    website: profile?.website ?? null,
    location: profile?.location ?? null,
    avatar_media_url:
      profile?.avatar_media_url?.replace('_normal.', '_400x400.') ?? null,
    header_media_url: profile?.header_media_url ?? null,
  } as ProfileHeaderData
}

/** Years (descending) in which the account actually tweeted, with counts. */
async function fetchActiveYears(
  accountId: string,
): Promise<{ year: number; count: number }[]> {
  const supabase = getMetaClient()
  const { data: first } = await supabase
    .from('tweets')
    .select('created_at')
    .eq('account_id', accountId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!first) return []
  const firstYear = new Date(first.created_at).getUTCFullYear()
  const nowYear = new Date().getUTCFullYear()
  const years: { year: number; count: number }[] = []
  const jobs: Promise<void>[] = []
  for (let year = firstYear; year <= nowYear; year++) {
    jobs.push(
      (async () => {
        const { count } = await supabase
          .from('tweets')
          .select('tweet_id', { count: 'exact', head: true })
          .eq('account_id', accountId)
          .gte('created_at', `${year}-01-01`)
          .lt('created_at', `${year + 1}-01-01`)
        if (count && count > 0) years.push({ year, count })
      })(),
    )
  }
  await Promise.all(jobs)
  return years.sort((a, b) => b.year - a.year)
}

interface TweetQueryScope {
  accountId: string
  year?: number
  /** FTS terms OR'd together (topic scope) */
  terms?: string[]
}

const applyScope = (query: any, scope: TweetQueryScope) => {
  let q = query.eq('account_id', scope.accountId)
  if (scope.year) {
    q = q
      .gte('created_at', `${scope.year}-01-01`)
      .lt('created_at', `${scope.year + 1}-01-01`)
  }
  if (scope.terms && scope.terms.length > 0) {
    const orQuery = scope.terms
      .map((t) => `fts.wfts.${t.replace(/[,()]/g, ' ').trim()}`)
      .join(',')
    q = q.or(orQuery)
  }
  return q
}

/**
 * Top tweets for a scope. Originals only (no RTs, no replies) so the archive
 * reads as the person's own voice; ranked by likes.
 */
async function fetchTopTweets(
  scope: TweetQueryScope,
  sort: 'likes' | 'newest',
  limit: number,
): Promise<ArchiveTweet[]> {
  const supabase = getMetaClient()
  let query = applyScope(
    supabase.from('tweets').select(TWEET_SELECT),
    scope,
  )
    .is('reply_to_tweet_id', null)
    .not('full_text', 'ilike', 'RT @%')
  query =
    sort === 'likes'
      ? query.order('favorite_count', { ascending: false })
      : query.order('created_at', { ascending: false })
  const { data, error } = await query.limit(limit)
  if (error) {
    devLog('metaTwitter fetchTopTweets error', { error, scope })
    return []
  }
  const avatar = await getCachedProfileHeader(scope.accountId)
  return ((data ?? []) as unknown as RawTweetRow[]).map((row) =>
    normalizeTweet(row, avatar?.avatar_media_url ?? null),
  )
}

/** Media gallery for a scope: photos from the account's tweets, by likes. */
async function fetchMedia(
  scope: TweetQueryScope,
  limit: number,
): Promise<ArchiveMediaItem[]> {
  const supabase = getMetaClient()
  const { data, error } = await applyScope(
    supabase
      .from('tweets')
      .select(
        'tweet_id, created_at, favorite_count, media:tweet_media!inner ( media_url, media_type, width, height )',
      ),
    scope,
  )
    .not('full_text', 'ilike', 'RT @%')
    .order('favorite_count', { ascending: false })
    .limit(limit)
  if (error) {
    devLog('metaTwitter fetchMedia error', { error, scope })
    return []
  }
  const items: ArchiveMediaItem[] = []
  for (const row of (data ?? []) as any[]) {
    for (const m of row.media ?? []) {
      if (m.media_type !== 'photo') continue
      items.push({
        ...m,
        tweet_id: row.tweet_id,
        created_at: row.created_at,
        favorite_count: row.favorite_count,
      })
    }
  }
  return items
}

/**
 * People the account interacted with most in a scope, approximated by who
 * they replied to (reply_to_username on their own tweets), aggregated in JS —
 * no group-by over PostgREST, and no per-chapter RPC exists.
 */
async function fetchTopPeople(
  scope: TweetQueryScope,
  limit: number,
): Promise<ArchivePerson[]> {
  const supabase = getMetaClient()
  const { data, error } = await applyScope(
    supabase.from('tweets').select('reply_to_username, reply_to_user_id'),
    scope,
  )
    .not('reply_to_username', 'is', null)
    .order('created_at', { ascending: false })
    .limit(3000)
  if (error) {
    devLog('metaTwitter fetchTopPeople error', { error, scope })
    return []
  }
  const counts = new Map<string, ArchivePerson>()
  for (const row of data ?? []) {
    const screenName = row.reply_to_username as string
    if (!screenName) continue
    // Skip self-replies (threads)
    if (row.reply_to_user_id === scope.accountId) continue
    const existing = counts.get(screenName.toLowerCase())
    if (existing) {
      existing.interactions++
    } else {
      counts.set(screenName.toLowerCase(), {
        user_id: (row.reply_to_user_id as string) ?? screenName,
        screen_name: screenName,
        name: null,
        interactions: 1,
      })
    }
  }
  const top = Array.from(counts.values())
    .sort((a, b) => b.interactions - a.interactions)
    .slice(0, limit)

  // Hydrate avatars + display names for people who are in the archive.
  const ids = top.map((p) => p.user_id).filter(Boolean)
  if (ids.length > 0) {
    const { data: profiles } = await supabase
      .from('all_profile')
      .select('account_id, avatar_media_url')
      .in('account_id', ids)
      .order('archive_upload_id', { ascending: false })
    const { data: accounts } = await supabase
      .from('all_account')
      .select('account_id, account_display_name')
      .in('account_id', ids)
    const avatarByAccount = new Map<string, string>()
    for (const p of profiles ?? []) {
      if (p.avatar_media_url && !avatarByAccount.has(p.account_id)) {
        avatarByAccount.set(p.account_id, p.avatar_media_url)
      }
    }
    const nameByAccount = new Map<string, string>(
      (accounts ?? []).map((a) => [a.account_id, a.account_display_name ?? '']),
    )
    for (const person of top) {
      person.avatar_media_url = avatarByAccount.get(person.user_id) ?? null
      person.in_archive = nameByAccount.has(person.user_id)
      if (nameByAccount.get(person.user_id)) {
        person.name = nameByAccount.get(person.user_id)!
      }
    }
  }
  return top
}

/** Per-scope media count (cheap head count for section labels). */
async function fetchMediaCount(scope: TweetQueryScope): Promise<number> {
  const supabase = getMetaClient()
  const { count } = await applyScope(
    supabase
      .from('tweets')
      .select('tweet_id, media:tweet_media!inner(media_id)', {
        count: 'exact',
        head: true,
      }),
    scope,
  )
  return count ?? 0
}

// ---------------------------------------------------------------------------
// Cached entry points. Keys are versioned; bump the suffix to bust.
// ---------------------------------------------------------------------------

const DAY = 86400

export const getCachedProfileHeader = unstable_cache(
  fetchProfileHeader,
  ['meta-twitter-profile-header-v1'],
  { revalidate: 3600 },
)

/**
 * Resolve a /user/[account_id] route param (raw account_id, username, or
 * "archive:"/"optin:" directory id) to a plain account_id.
 */
export const resolveAccountId = unstable_cache(
  async (param: string): Promise<string | null> => {
    let decoded: string
    try {
      decoded = decodeURIComponent(param)
    } catch {
      return null
    }
    decoded = decoded.replace(/^(archive|optin):/, '')
    if (/^\d+$/.test(decoded)) return decoded
    const supabase = getMetaClient()
    const { data } = await supabase
      .from('all_account')
      .select('account_id')
      .ilike('username', decoded)
      .limit(1)
      .maybeSingle()
    return data?.account_id ?? null
  },
  ['meta-twitter-resolve-account-v1'],
  { revalidate: DAY },
)

/** Latest archive upload date, for the "Archived <month year>" meta chip. */
export const getCachedArchivedAt = unstable_cache(
  async (accountId: string): Promise<string | null> => {
    const supabase = getMetaClient()
    const { data } = await supabase
      .from('archive_upload')
      .select('archive_at')
      .eq('account_id', accountId)
      .order('archive_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return data?.archive_at ?? null
  },
  ['meta-twitter-archived-at-v1'],
  { revalidate: DAY },
)

export const getCachedActiveYears = unstable_cache(
  fetchActiveYears,
  ['meta-twitter-active-years-v1'],
  { revalidate: DAY },
)

export const getCachedChapterData = unstable_cache(
  async (
    accountId: string,
    year: number | undefined,
    terms: string[] | undefined,
  ) => {
    const scope: TweetQueryScope = { accountId, year, terms }
    // People are scoped to the chapter (year), not the topic — topic-filtered
    // reply sets are too sparse to rank meaningfully.
    const peopleScope: TweetQueryScope = { accountId, year }
    const [topTweets, newestTweets, media, people, mediaCount] =
      await Promise.all([
        fetchTopTweets(scope, 'likes', 24),
        fetchTopTweets(scope, 'newest', 24),
        fetchMedia(scope, 18),
        fetchTopPeople(peopleScope, 8),
        fetchMediaCount(scope),
      ])
    return { topTweets, newestTweets, media, people, mediaCount }
  },
  ['meta-twitter-chapter-v2'],
  { revalidate: DAY },
)

export const getCachedTweetsByIds = unstable_cache(
  async (accountId: string, tweetIds: string[]): Promise<ArchiveTweet[]> => {
    if (tweetIds.length === 0) return []
    const supabase = getMetaClient()
    const { data, error } = await supabase
      .from('tweets')
      .select(TWEET_SELECT)
      .eq('account_id', accountId)
      .in('tweet_id', tweetIds)
    if (error) {
      devLog('metaTwitter getCachedTweetsByIds error', { error })
      return []
    }
    const avatar = await getCachedProfileHeader(accountId)
    const byId = new Map(
      ((data ?? []) as unknown as RawTweetRow[]).map((row) => [
        row.tweet_id,
        normalizeTweet(row, avatar?.avatar_media_url ?? null),
      ]),
    )
    return tweetIds.map((id) => byId.get(id)).filter(Boolean) as ArchiveTweet[]
  },
  ['meta-twitter-tweets-by-ids-v1'],
  { revalidate: DAY },
)
