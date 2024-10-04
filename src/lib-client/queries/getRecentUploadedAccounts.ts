import { SupabaseClient } from '@supabase/supabase-js'

const getRecentUploadedAccounts = async (supabase: SupabaseClient) => {
  const { data, error } = await supabase
    .from('archive_upload')
    .select(
      `
        account:account (
          username,
          account_display_name,
          profile:profile (avatar_media_url)
        )
      `,
    )
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching recent uploads:', error)
    return null
  }

  const uniqueAccounts = new Map()
  data.forEach((item) => {
    const account = item.account[0]
    if (account && !uniqueAccounts.has(account.username)) {
      uniqueAccounts.set(account.username, {
        username: account.username,
        avatar_media_url: account.profile?.[0]?.avatar_media_url,
      })
    }
  })
  return Array.from(uniqueAccounts.values()).slice(0, 7)
}

export default getRecentUploadedAccounts
