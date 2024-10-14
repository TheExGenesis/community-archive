import { createBrowserClient } from '@/utils/supabase'
import { User } from '@/lib-client/types'
import { formatUserData } from '@/lib-client/user-utils'
import { SupabaseClient } from '@supabase/supabase-js'
import { devLog } from '@/lib-client/devLog'

export const fetchUsers = async (supabase: SupabaseClient): Promise<User[]> => {
  const { data, error } = await supabase
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
      profile:profile(bio, website, location, avatar_media_url),
      archive_upload:archive_upload(archive_at, created_at)
    `,
    )
    .order('num_tweets', { ascending: false })

  if (error) throw error

  const formattedUsers: User[] = data.map(formatUserData)

  return formattedUsers.sort((a, b) => {
    if (!a.archive_at) return 1
    if (!b.archive_at) return -1
    return new Date(b.archive_at).getTime() - new Date(a.archive_at).getTime()
  })
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
      profile:profile(bio, website, location, avatar_media_url),
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
