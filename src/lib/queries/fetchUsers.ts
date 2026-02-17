import { User } from '@/lib/types'
import { formatUserData } from '@/lib/user-utils'
import { SupabaseClient } from '@supabase/supabase-js'
import { devLog } from '@/lib/devLog'

export interface FetchUsersOptions {
  limit?: number
  offset?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export const fetchUsers = async (
  supabase: SupabaseClient,
  options?: FetchUsersOptions
): Promise<User[]> => {
  const { limit, offset = 0, sortBy = 'archive_uploaded_at', sortOrder = 'desc' } = options || {}

  let query = supabase
    .schema('public')
    .from('user_directory')
    .select(
      `
      account_id,
      username,
      account_display_name,
      created_at,
      num_tweets,
      num_followers,
      num_following,
      num_likes,
      bio,
      website,
      location,
      avatar_media_url,
      archive_at,
      archive_uploaded_at
    `,
    )
    .order(sortBy, { ascending: sortOrder === 'asc' })

  if (limit) {
    query = query.range(offset, offset + limit - 1)
  }

  const { data, error } = await query

  if (error) throw error

  return (data as User[]) || []
}

export const fetchUsersCount = async (supabase: SupabaseClient): Promise<number> => {
  const { count, error } = await supabase
    .schema('public')
    .from('user_directory')
    .select('account_id', { count: 'exact', head: true })

  if (error) throw error
  return count || 0
}

export const getUserData = async (
  supabase: SupabaseClient,
  account_id: string,
) => {
  const { data } = await supabase
    .schema('public')
    .from('account')
    .select(
      `
      account_id,
      username,
      account_display_name,
      created_at,
      num_tweets,
      num_followers,
      num_following,
      num_likes,
      profile:profile(bio, website, location, avatar_media_url, header_media_url),
      archive_upload:archive_upload(archive_at, created_at)
    `,
    )
    .or(`account_id.eq.${account_id},username.ilike.${account_id}`)
    .single()

  if (!data) {
    return null
  }

  const formattedUser = formatUserData(data)
  devLog('getUserData', { data, formattedUser })

  return formattedUser
}
