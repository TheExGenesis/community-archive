import 'server-only'

import { SupabaseClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import { Database } from '@/database-types'
import {
  createPublicReadClient,
  publicDataConfig,
} from '@/lib/publicDataSource'
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

async function fetchProfileHeader(
  accountId: string,
): Promise<ProfileHeaderData | null> {
  const supabase = getMetaClient()
  const [
    { data: account, error: accountError },
    { data: profile, error: profileError },
    { data: membership, error: membershipError },
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
    supabase
      .from('user_directory')
      .select('has_archive, is_opted_in')
      .eq('account_id', accountId)
      .maybeSingle(),
  ])
  if (accountError) throw accountError
  if (profileError) throw profileError
  if (membershipError) throw membershipError
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

const cachedProfileHeader = unstable_cache(
  (accountId: string, _source: string) => fetchProfileHeader(accountId),
  ['meta-twitter-profile-header-v4'],
  { revalidate: 3600 },
)

export interface PublicProfileIdentity {
  accountId: string | null
  username: string
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
      .select('account_id, username')
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
  return { accountId: data.account_id ?? null, username: data.username }
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

export const getCachedProfileHeader = (accountId: string) =>
  cachedProfileHeader(accountId, publicDataConfig().sourceId)
export const getCachedArchivedAt = (accountId: string) =>
  cachedArchivedAt(accountId, publicDataConfig().sourceId)
