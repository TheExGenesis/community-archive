import { DirectoryUser, FormattedUser, SortKey } from '@/lib/types'
import { SupabaseClient } from '@supabase/supabase-js'
import { devLog } from '@/lib/devLog'

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
  `/user/${encodeURIComponent(user.directory_id)}`

export const fetchUsers = async (
  supabase: SupabaseClient,
  options?: FetchUsersOptions,
): Promise<DirectoryUser[]> => {
  const {
    limit,
    offset = 0,
    sortBy = 'num_followers',
    sortOrder = 'desc',
    search,
  } = options || {}

  let query = supabase
    .schema('public')
    .from('user_directory')
    .select(
      `
      account_id,
      username,
      account_display_name,
      avatar_media_url,
      num_followers,
      archive_uploaded_at,
      directory_id,
      has_archive,
      is_opted_in,
      opted_in_at,
      joined_at
    `,
    )

  if (search) {
    query = query.or(buildDirectorySearchFilter(search))
  }

  query = query.order(sortBy, {
    ascending: sortOrder === 'asc',
    nullsFirst: false,
  })
  query = query.order('directory_id', { ascending: true })

  if (limit) {
    query = query.range(offset, offset + limit - 1)
  }

  const { data, error } = await query

  if (error) throw error

  return (data as DirectoryUser[]) || []
}

export const fetchUsersCount = async (
  supabase: SupabaseClient,
  search?: string,
): Promise<number> => {
  let query = supabase
    .schema('public')
    .from('user_directory')
    .select('account_id', { count: 'exact', head: true })

  if (search) {
    query = query.or(buildDirectorySearchFilter(search))
  }

  const { count, error } = await query

  if (error) throw error
  return count || 0
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
  const initialQuery = supabase
    .schema('public')
    .from('user_directory')
    .select(select)

  const { data: accountMatch, error: accountError } = isDirectoryIdentifier
    ? await initialQuery.eq('directory_id', decodedIdentifier).maybeSingle()
    : await initialQuery.eq('account_id', decodedIdentifier).maybeSingle()

  if (accountError) throw accountError

  let data = accountMatch
  if (!data) {
    const { data: usernameMatch, error: usernameError } = await supabase
      .schema('public')
      .from('user_directory')
      .select(select)
      .ilike('username', decodedIdentifier)
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
