import {
  DirectoryUser,
  FormattedUser,
  SortKey,
  UserDirectoryPage,
} from '@/lib/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { devLog } from '@/lib/devLog'
import { rankUserSuggestions } from '@/lib/searchSuggestions'
import type { UserSuggestion } from '@/lib/searchSuggestions'
import { userProfileHref } from '@/lib/navigation'
import { isTwitterUsername } from '@/lib/apiInputValidation'

export interface FetchUsersOptions {
  limit?: number
  offset?: number
  sortBy?: SortKey
  sortOrder?: 'asc' | 'desc'
  search?: string
}

export const buildDirectorySearchFilter = (search: string) => {
  const escapedSearch = search.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const pattern = `"%${escapedSearch}%"`

  return `username.ilike.${pattern},account_display_name.ilike.${pattern}`
}

export const getDirectoryProfileHref = (user: DirectoryUser) =>
  userProfileHref(user.username, user.account_id || user.directory_id)

export const fetchUsers = async (
  options?: FetchUsersOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<UserDirectoryPage> => {
  const {
    limit,
    offset = 0,
    sortBy = 'num_followers',
    sortOrder = 'desc',
    search,
  } = options || {}

  const searchParams = new URLSearchParams({
    limit: String(limit || 15),
    offset: String(offset),
    sort_by: sortBy,
    sort_order: sortOrder,
  })
  if (search) searchParams.set('search', search)

  const response = await fetchImpl(`/api/user-directory?${searchParams}`, {
    cache: 'no-store',
  })
  if (!response.ok) {
    throw new Error(`User directory request failed (${response.status})`)
  }
  const page = (await response.json()) as UserDirectoryPage
  if (!Array.isArray(page?.users) || typeof page.hasMore !== 'boolean') {
    throw new Error('User directory returned an invalid response')
  }
  return page
}

const normalizeSuggestionFragment = (fragment: string) => {
  const normalizedFragment = fragment
    .trim()
    .replace(/^@/, '')
    .toLocaleLowerCase()

  return /^[a-z0-9_]{2,15}$/.test(normalizedFragment)
    ? normalizedFragment
    : null
}

export const fetchMemberSuggestions = async (
  fragment: string,
  limit = 6,
  fetchImpl: typeof fetch = fetch,
): Promise<UserSuggestion[]> => {
  const normalizedFragment = normalizeSuggestionFragment(fragment)
  if (!normalizedFragment) return []

  const page = await fetchUsers(
    {
      limit: Math.max(limit * 5, 30),
      search: normalizedFragment,
    },
    fetchImpl,
  )

  return rankUserSuggestions(
    page.users
      .filter((user) =>
        user.username.toLocaleLowerCase().includes(normalizedFragment),
      )
      .map(
        ({
          account_id,
          directory_id,
          username,
          account_display_name,
          avatar_media_url,
          num_followers,
        }) => ({
          account_id,
          directory_id,
          username,
          account_display_name,
          avatar_media_url,
          num_followers,
        }),
      ),
    normalizedFragment,
    limit,
  )
}

export const fetchAccountSuggestions = async (
  supabase: SupabaseClient,
  fragment: string,
  limit = 6,
): Promise<UserSuggestion[]> => {
  const normalizedFragment = normalizeSuggestionFragment(fragment)
  if (!normalizedFragment) return []

  const escapedFragment = normalizedFragment.replace(/[\\%_]/g, '\\$&')
  const { data, error } = await supabase
    .schema('public')
    .from('all_account')
    .select('account_id, username, account_display_name, num_followers')
    .ilike('username', `%${escapedFragment}%`)
    .order('num_followers', { ascending: false, nullsFirst: false })
    .limit(Math.max(limit * 5, 30))

  if (error) throw error

  return rankUserSuggestions(
    (data || []).map((user) => ({
      account_id: user.account_id,
      directory_id: `account:${user.account_id}`,
      username: user.username,
      account_display_name: user.account_display_name,
      avatar_media_url: null,
      num_followers: user.num_followers,
    })),
    normalizedFragment,
    limit,
  )
}

export const getUserData = async (
  supabase: SupabaseClient,
  identifier: string,
) => {
  let decodedIdentifier: string
  try {
    decodedIdentifier = decodeURIComponent(identifier)
  } catch {
    return null
  }
  const select = `
    account_id,
    username,
    account_display_name,
    created_at,
    bio,
    website,
    location,
    avatar_media_url,
    archive_at,
    archive_uploaded_at,
    num_tweets,
    num_followers,
    num_following,
    num_likes,
    joined_at,
    has_archive,
    is_opted_in
  `

  const isDirectoryIdentifier = /^(archive|optin):/.test(decodedIdentifier)
  const isExplicitUsername = decodedIdentifier.startsWith('@')
  const usernameIdentifier = isExplicitUsername
    ? decodedIdentifier.slice(1)
    : decodedIdentifier
  if (isExplicitUsername && !isTwitterUsername(usernameIdentifier)) return null
  const initialQuery = supabase
    .schema('public')
    .from('user_directory')
    .select(select)

  const { data: accountMatch, error: accountError } = isExplicitUsername
    ? { data: null, error: null }
    : isDirectoryIdentifier
      ? await initialQuery.eq('directory_id', decodedIdentifier).maybeSingle()
      : await initialQuery.eq('account_id', decodedIdentifier).maybeSingle()

  if (accountError) throw accountError

  let data = accountMatch
  if (!data) {
    const { data: usernameMatch, error: usernameError } = await supabase
      .schema('public')
      .from('user_directory')
      .select(select)
      .ilike('username', usernameIdentifier)
      .limit(1)
      .maybeSingle()

    if (usernameError) throw usernameError
    data = usernameMatch
  }

  if (!data) {
    return null
  }

  let headerMediaUrl: string | null = null
  if (data.account_id) {
    const { data: profile } = await supabase
      .schema('public')
      .from('all_profile')
      .select('header_media_url')
      .eq('account_id', data.account_id)
      .order('archive_upload_id', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()

    headerMediaUrl = profile?.header_media_url ?? null
  }

  const formattedUser: FormattedUser = {
    ...data,
    username: data.username || decodedIdentifier,
    account_display_name:
      data.account_display_name || data.username || decodedIdentifier,
    header_media_url: headerMediaUrl,
    has_archive: data.has_archive === true,
    is_opted_in: data.is_opted_in === true,
  }
  devLog('getUserData', { data, formattedUser })

  return formattedUser
}
