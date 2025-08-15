import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/database-types'

export const getMentionedUserAccount = async (supabase: SupabaseClient<Database>, username: string) => {
  
  // First get the account data
  const { data: accountData } = await supabase
    .schema('public')
    .from('all_account')
    .select('username, account_display_name, account_id')
    .eq('username', username)
    .single()

  if (!accountData) {
    return { data: null }
  }

  // Then get the profile data
  const { data: profileData } = await supabase
    .schema('public')
    .from('all_profile')
    .select('avatar_media_url')
    .eq('account_id', accountData.account_id)
    .single()

  // Combine the data
  return {
    data: {
      ...accountData,
      profile: profileData
    }
  }
}