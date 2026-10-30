import 'server-only'

import { SupabaseClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import { Database } from '@/database-types'
import {
  createPublicReadClient,
  publicDataConfig,
} from '@/lib/publicDataSource'
import { devLog } from '@/lib/devLog'
import { isTwitterUsername } from '@/lib/apiInputValidation'
import { createServerServiceRoleClient } from '@/utils/supabase'
import type {
  ArchiveMediaItem,
  ArchivePerson,
  ProfileHeaderData,
} from './types'

export type { ArchiveMediaItem, ArchivePerson, ProfileHeaderData }

const DAY = 86_400

const getMetaClient = (): SupabaseClient<Database> => {
  return createPublicReadClient()
}

async function fetchHeaderMembership(
  supabase: SupabaseClient<Database>,
  accountId: string,
  username?: string,
  hasArchive?: boolean,
) {
  if (username === undefined || hasArchive === undefined) {
    const { data, error } = await supabase
      .from('user_directory')
      .select('has_archive, is_opted_in')
      .eq('account_id', accountId)
      .maybeSingle()
    if (error) throw error
    return data
  }

  // The live directory lookup already established membership and archive
  // status. Its non-archive branch consists exclusively of opted-in members.
  if (!hasArchive) return { has_archive: false, is_opted_in: true }

  // Match the archived_members opt-in flag without rebuilding the directory
  // view. These are display metadata reads, never a substitute for eligibility.
  const results = await Promise.all([
    supabase
      .from('optin')
      .select('id')
      .eq('opted_in', true)
      .eq('twitter_user_id', accountId)
      .limit(1)
      .maybeSingle(),
    supabase
      .from('optin')
      .select('id')
      .eq('opted_in', true)
      .ilike('username', username.replace(/_/g, '\\_'))
      .limit(1)
      .maybeSingle(),
  ])
  for (const result of results) if (result.error) throw result.error
  return {
    has_archive: true,
    is_opted_in: results.some((result) => result.data !== null),
  }
}

async function fetchProfileHeader(
  accountId: string,
  username?: string,
  hasArchive?: boolean,
): Promise<ProfileHeaderData | null> {
  const supabase = getMetaClient()
  const [
    { data: account, error: accountError },
    { data: profile, error: profileError },
    membership,
  ] = await Promise.all([
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
    fetchHeaderMembership(supabase, accountId, username, hasArchive),
  ])
  if (accountError) throw accountError
  if (profileError) throw profileError
  if (!account) return null
  const bio = profile?.bio ?? null
  const website = profile?.website ?? null
  return {
    ...account,
    account_display_name: account.account_display_name ?? account.username,
    bio,
    website,
    location: profile?.location ?? null,
    avatar_media_url: profile?.avatar_media_url ?? null,
    header_media_url: profile?.header_media_url ?? null,
    has_archive: membership?.has_archive === true,
    is_opted_in: membership?.is_opted_in === true,
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

const cachedProfileHeader = unstable_cache(
  (
    accountId: string,
    _source: string,
    username?: string,
    hasArchive?: boolean,
  ) => fetchProfileHeader(accountId, username, hasArchive),
  ['meta-twitter-profile-header-v5'],
  { revalidate: 3600 },
)

export interface PublicProfileIdentity {
  accountId: string | null
  username: string
  /** Supplied by the bounded RPC or view, absent on older identity RPCs. */
  hasArchive?: boolean
}

const isMissingFunctionError = (error: { code?: string }) =>
  error.code === 'PGRST202' || error.code === '42883'

/**
 * Resolve only identities that are currently eligible for public serving.
 * This policy lookup is deliberately uncached so an explicit opt-out hides a
 * profile on the next request instead of waiting for an application cache.
 */
export const resolvePublicProfileIdentity = async (
  param: string,
): Promise<PublicProfileIdentity | null> => {
  let decoded: string
  try {
    decoded = decodeURIComponent(param)
  } catch {
    return null
  }

  const isDirectoryIdentifier = /^(archive|optin):/.test(decoded)
  const isAccountIdentifier = /^\d{1,20}$/.test(decoded)
  if (
    !isDirectoryIdentifier &&
    !isAccountIdentifier &&
    !isTwitterUsername(decoded)
  ) {
    return null
  }

  const supabase = getMetaClient()
  const viewLookup = () => {
    const baseQuery = supabase
      .from('user_directory')
      .select('account_id, username, has_archive')
    return isDirectoryIdentifier
      ? baseQuery.eq('directory_id', decoded).limit(1).maybeSingle()
      : isAccountIdentifier
        ? baseQuery.eq('account_id', decoded).limit(1).maybeSingle()
        : baseQuery.ilike('username', decoded).limit(1).maybeSingle()
  }

  // Username URLs use the bounded, index-driven membership lookup. The older
  // identity RPC still evaluates the directory view for members (and is absent
  // on some deployments, adding an error round trip before the view fallback).
  // Both RPCs keep the directory's live membership and opt-out semantics.
  const rpcLookup = async () => {
    const rpc = isAccountIdentifier
      ? await supabase.rpc(
          'resolve_directory_identity',
          { identifier: decoded },
          { get: true },
        )
      : await supabase.rpc(
          'directory_members_by_username',
          { p_usernames: [decoded.toLowerCase()] },
          { get: true },
        )
    // Migration not applied yet: keep serving through the view.
    if (rpc.error && isMissingFunctionError(rpc.error)) return viewLookup()
    return { data: rpc.data?.[0] ?? null, error: rpc.error }
  }

  const { data, error } = isDirectoryIdentifier
    ? await viewLookup()
    : await rpcLookup()

  if (error) throw error
  if (!data?.username) return null
  return {
    accountId: data.account_id ?? null,
    username: data.username,
    ...('has_archive' in data && typeof data.has_archive === 'boolean'
      ? { hasArchive: data.has_archive }
      : {}),
  }
}

/**
 * Whether PostgreSQL policy withholds an account from public serving: an
 * explicit opt-out or a scrape block. The stable ID is the key; the current
 * handle rides along because an opt-out recorded by handle for an account that
 * never joined has no ID to match. Errors propagate so a failed policy read
 * never renders a profile.
 */
export const isPolicyBlockedAccount = async (
  accountId: string,
  username: string,
): Promise<boolean> => {
  // Next would otherwise cache the RPC and keep serving a stale decision.
  const { data, error } = await createServerServiceRoleClient({
    noStore: true,
  }).rpc('policy_account_is_blocked', {
    p_account_id: accountId,
    p_username: username,
  })
  if (error) throw error
  return data !== false
}

const cachedArchivedAt = unstable_cache(
  async (accountId: string, _source: string): Promise<string | null> => {
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

const cachedProfileSidebarData = unstable_cache(
  async (accountId: string, year: number | undefined, _source: string) => {
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

export const getCachedProfileHeader = (
  accountId: string,
  identity?: PublicProfileIdentity,
) => {
  const knownMembership =
    identity?.accountId === accountId &&
    isTwitterUsername(identity.username) &&
    typeof identity.hasArchive === 'boolean'
  return cachedProfileHeader(
    accountId,
    publicDataConfig().sourceId,
    knownMembership ? identity.username : undefined,
    knownMembership ? identity.hasArchive : undefined,
  )
}
export const getCachedArchivedAt = (accountId: string) =>
  cachedArchivedAt(accountId, publicDataConfig().sourceId)
export const getCachedProfileSidebarData = (
  accountId: string,
  year: number | undefined,
) => cachedProfileSidebarData(accountId, year, publicDataConfig().sourceId)
