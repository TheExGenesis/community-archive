import 'server-only'

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import { Database } from '@/database-types'
import { devLog } from '@/lib/devLog'
import type {
  ArchiveMediaItem,
  ArchivePerson,
  ProfileHeaderData,
} from './types'

export type { ArchiveMediaItem, ArchivePerson, ProfileHeaderData }

const DAY = 86_400

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
    avatar_media_url: profile?.avatar_media_url ?? null,
    header_media_url: profile?.header_media_url ?? null,
    has_archive: true,
  }
}

interface SidebarScope {
  accountId: string
  year?: number
}

const applyScope = (query: any, scope: SidebarScope) => {
  let scoped = query.eq('account_id', scope.accountId)
  if (scope.year) {
    scoped = scoped
      .gte('created_at', `${scope.year}-01-01`)
      .lt('created_at', `${scope.year + 1}-01-01`)
  }
  return scoped
}

async function fetchMedia(
  scope: SidebarScope,
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
    for (const media of row.media ?? []) {
      if (media.media_type !== 'photo') continue
      items.push({
        ...media,
        tweet_id: row.tweet_id,
        created_at: row.created_at,
        favorite_count: row.favorite_count,
      })
    }
  }
  return items
}

async function fetchTopPeople(
  scope: SidebarScope,
  limit: number,
): Promise<ArchivePerson[]> {
  const supabase = getMetaClient()
  const { data, error } = await applyScope(
    supabase.from('tweets').select('reply_to_username, reply_to_user_id'),
    scope,
  )
    .not('reply_to_username', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1000)
  if (error) {
    devLog('metaTwitter fetchTopPeople error', { error, scope })
    return []
  }

  const counts = new Map<string, ArchivePerson>()
  for (const row of data ?? []) {
    const screenName = row.reply_to_username as string
    if (!screenName || row.reply_to_user_id === scope.accountId) continue
    const key = screenName.toLowerCase()
    const existing = counts.get(key)
    if (existing) {
      existing.interactions += 1
    } else {
      counts.set(key, {
        user_id: (row.reply_to_user_id as string) ?? screenName,
        screen_name: screenName,
        name: null,
        interactions: 1,
      })
    }
  }
  const top = Array.from(counts.values())
    .sort((left, right) => right.interactions - left.interactions)
    .slice(0, limit)

  const ids = top.map((person) => person.user_id).filter(Boolean)
  if (ids.length === 0) return top

  const [{ data: profiles }, { data: accounts }] = await Promise.all([
    supabase
      .from('all_profile')
      .select('account_id, avatar_media_url')
      .in('account_id', ids)
      .order('archive_upload_id', { ascending: false }),
    supabase
      .from('all_account')
      .select('account_id, account_display_name')
      .in('account_id', ids),
  ])
  const avatarByAccount = new Map<string, string>()
  for (const profile of profiles ?? []) {
    if (profile.avatar_media_url && !avatarByAccount.has(profile.account_id)) {
      avatarByAccount.set(profile.account_id, profile.avatar_media_url)
    }
  }
  const nameByAccount = new Map<string, string>(
    (accounts ?? []).map((account) => [
      account.account_id,
      account.account_display_name ?? '',
    ]),
  )
  for (const person of top) {
    person.avatar_media_url = avatarByAccount.get(person.user_id) ?? null
    person.in_archive = nameByAccount.has(person.user_id)
    person.name = nameByAccount.get(person.user_id) || null
  }
  return top
}

async function fetchMediaCount(scope: SidebarScope): Promise<number> {
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

export const getCachedProfileHeader = unstable_cache(
  fetchProfileHeader,
  ['meta-twitter-profile-header-v2'],
  { revalidate: 3600 },
)

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

export const getCachedProfileSidebarData = unstable_cache(
  async (accountId: string, year: number | undefined) => {
    const scope: SidebarScope = { accountId, year }
    const [media, people, mediaCount] = await Promise.all([
      fetchMedia(scope, 6),
      fetchTopPeople(scope, 8),
      fetchMediaCount(scope),
    ])
    return { media, people, mediaCount }
  },
  ['meta-twitter-profile-sidebar-v2'],
  { revalidate: DAY },
)
