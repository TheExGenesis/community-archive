import { requireAuth } from '@/lib/auth-utils'
import { createServerAdminClient, createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'
import ProfileContent from './ProfileContent'

const getTwitterUsername = (
  user: Awaited<ReturnType<typeof requireAuth>>['user'],
) =>
  (
    user.user_metadata?.user_name ||
    user.user_metadata?.preferred_username ||
    user.user_metadata?.username ||
    user.app_metadata?.user_name ||
    user.app_metadata?.preferred_username ||
    user.app_metadata?.username ||
    ''
  )
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/[^a-z0-9_]/g, '')

export default async function ProfilePage() {
  const { user } = await requireAuth()
  const cookieStore = await cookies()
  const supabase = createServerClient(cookieStore)
  const admin = createServerAdminClient(cookieStore)

  // Get the Twitter provider_id from user metadata (this is the account_id in archive_upload)
  const twitterAccountId =
    user.user_metadata?.provider_id || user.app_metadata?.provider_id
  const twitterUsername = getTwitterUsername(user)
  const optInQuery = twitterUsername
    ? admin
        .from('optin')
        .select('*')
        .or(`user_id.eq.${user.id},username.eq.${twitterUsername}`)
        .limit(1)
        .maybeSingle()
    : admin.from('optin').select('*').eq('user_id', user.id).maybeSingle()

  // Get user's opt-in/opt-out status and archives
  const [optInResponse, archivesResponse] = await Promise.all([
    optInQuery,
    // Query archives by account_id (Twitter user ID), not user_id (Supabase auth ID)
    twitterAccountId
      ? supabase
          .from('archive_upload')
          .select(
            `
            id,
            account_id,
            upload_phase,
            created_at,
            archive_at,
            keep_private,
            accounts:all_account!left(
              account_id,
              username,
              account_display_name,
              num_tweets,
              profile:all_profile(avatar_media_url)
            )
          `,
          )
          .eq('account_id', twitterAccountId)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ])

  return (
    <main className="min-h-screen bg-card dark:bg-background">
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <ProfileContent
          user={user}
          initialOptInData={optInResponse.data}
          archives={archivesResponse.data || []}
        />
      </div>
    </main>
  )
}
