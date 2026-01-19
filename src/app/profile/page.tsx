import { requireAuth } from '@/lib/auth-utils'
import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'
import ProfileContent from './ProfileContent'

export default async function ProfilePage() {
  const { user } = await requireAuth()
  const cookieStore = await cookies()
  const supabase = createServerClient(cookieStore)

  // Get the Twitter provider_id from user metadata (this is the account_id in archive_upload)
  const twitterAccountId = user.user_metadata?.provider_id || user.app_metadata?.provider_id

  // Get user's opt-in/opt-out status and archives
  const [optInResponse, archivesResponse] = await Promise.all([
    supabase
      .from('optin')
      .select('*')
      .eq('user_id', user.id)
      .single(),
    // Query archives by account_id (Twitter user ID), not user_id (Supabase auth ID)
    twitterAccountId
      ? supabase
          .from('archive_upload')
          .select(`
            id,
            account_id,
            upload_phase,
            created_at,
            archive_at,
            keep_private,
            accounts:account!inner(
              account_id,
              username,
              account_display_name,
              num_tweets,
              profile(avatar_media_url)
            )
          `)
          .eq('account_id', twitterAccountId)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [], error: null })
  ])

  return (
    <main className="min-h-screen bg-white dark:bg-background">
      <div className="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <ProfileContent
          user={user}
          initialOptInData={optInResponse.data}
          archives={archivesResponse.data || []}
        />
      </div>
    </main>
  )
}