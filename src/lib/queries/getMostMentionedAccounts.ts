import { MentionedUser } from '@/components/TopMentionedMissingUsers'
import { createServerClient } from '@/utils/supabase'
import { devLog } from '../devLog'
import { cookies } from 'next/headers'

export async function getAccountMostMentionedAccounts(
  username: string,
): Promise<MentionedUser[]> {
  const cookieStore = cookies()
  const supabase = createServerClient(cookieStore)

  const { data: users, error } = await supabase
    .schema('public')
    .rpc('get_account_most_mentioned_accounts' as any, {
      username_: username,
      limit_: 10,
    })

  if (error) {
    console.error('Error fetching most mentioned accounts:', error)
    return []
  }

  const mentionedUsers = await Promise.all(
    users
      .filter((user: any) => user.screen_name !== username)
      .map(async (user: any) => {
        const { data: profile } = await supabase
          .from('profile')
          .select('*')
          .eq('account_id', user.user_id)
          .order('archive_upload_id', { ascending: false })
          .limit(1)
          .single()

        const { data: account } = await supabase
          .from('account')
          .select('*')
          .eq('account_id', user.user_id)
          .single()

        return {
          mentioned_user_id: user.user_id,
          screen_name: user.screen_name,
          mention_count: user.mention_count,
          account_display_name: user.name,
          avatar_media_url: profile?.avatar_media_url,
          uploaded: !!account,
        }
      }),
  )
  devLog('mentionedUsers', mentionedUsers)
  return mentionedUsers
}

export async function getArchiveMostMentionedAccounts(): Promise<
  MentionedUser[]
> {
  const cookieStore = cookies()
  const supabase = createServerClient(cookieStore)
  // const { data: rawUsers, error } = await supabase
  //   .schema('public')
  //   .rpc('get_top_mentioned_users' as any, { limit_: 10 })

  const { data: rawUsers, error } = await supabase
    .schema('public')
    .from('global_activity_summary')
    .select('top_mentioned_users')
    .single()

  if (error || !rawUsers?.top_mentioned_users) {
    console.error('Error fetching most mentioned accounts:', error)
    return []
  }

  const users = (rawUsers.top_mentioned_users as any[]).reduce(
    (acc: any, user: any) => {
      if (!acc.some((u: any) => u.user_id === user.user_id)) {
        acc.push(user)
      }
      return acc
    },
    [],
  )

  devLog('users', users)
  const userIds = users.map((user: any) => user.user_id)

  const { data: profiles } = await supabase
    .from('profile')
    .select('*')
    .in('account_id', userIds)
    .order('archive_upload_id', { ascending: false })

  const { data: accounts } = await supabase
    .from('account')
    .select('*')
    .in('account_id', userIds)

  const mentionedUsers = users.map((user: any) => {
    const profile = profiles?.find((p) => p.account_id === user.user_id)
    const account = accounts?.find((a) => a.account_id === user.user_id)
    return {
      mentioned_user_id: user.user_id,
      screen_name: user.screen_name,
      mention_count: user.mention_count,
      account_display_name: user.name,
      avatar_media_url: profile?.avatar_media_url,
      uploaded: !!account,
    }
  })

  devLog('mentionedUsers', mentionedUsers)
  return mentionedUsers
}
