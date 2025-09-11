import { requireAuth } from '@/lib/auth-utils'
import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'
import ProfileContent from './ProfileContent'

export default async function ProfilePage() {
  const { user } = await requireAuth()
  const cookieStore = await cookies()
  const supabase = createServerClient(cookieStore)

  // Get user's opt-in/opt-out status
  const [optInResponse, optOutResponse, archivesResponse] = await Promise.all([
    supabase
      .from('optin')
      .select('*')
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('optout')
      .select('*')
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('archive_upload')
      .select(`
        id,
        account_id,
        filename,
        upload_phase,
        created_at,
        archive_at,
        keep_private,
        total_tweets,
        accounts!inner(
          account_id,
          username,
          account_display_name,
          avatar_media_url
        )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
  ])

  return (
    <main className="min-h-screen bg-white dark:bg-background">
      <div className="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <ProfileContent
          user={user}
          initialOptInData={optInResponse.data}
          initialOptOutData={optOutResponse.data}
          archives={archivesResponse.data || []}
        />
      </div>
    </main>
  )
}