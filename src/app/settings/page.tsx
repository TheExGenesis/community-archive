import { requireAuth } from '@/lib/auth-utils'
import { isAdminUser } from '@/app/admin/data'
import { loadPendingCommunityProjects } from '@/lib/communityProjectDatabase'
import { getPublicProfileSettings } from '@/lib/profileCuration'
import { createServerAdminClient, createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'
import {
  getSubscriptionForAccount,
  maskSubscriptionEmail,
} from '@/lib/digest/emailSubscriptions'
import ProfileContent from '../profile/ProfileContent'
import { CommunitySubmissionQueue } from './CommunitySubmissionQueue'
import {
  DigestEmailSettings,
  type DigestEmailStatus,
} from './DigestEmailSettings'

const getTwitterUsername = (
  user: Awaited<ReturnType<typeof requireAuth>>['user'],
) =>
  (
    user.app_metadata?.user_name ||
    user.app_metadata?.preferred_username ||
    user.app_metadata?.username ||
    ''
  )
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/[^a-z0-9_]/g, '')

export default async function SettingsPage() {
  const { user } = await requireAuth('/settings')
  const isAdmin = isAdminUser(user)
  const cookieStore = await cookies()
  const supabase = createServerClient(cookieStore)
  const admin = createServerAdminClient(cookieStore)
  const rawTwitterAccountId = user.app_metadata?.provider_id
  const twitterAccountId =
    typeof rawTwitterAccountId === 'string' &&
    /^\d{1,20}$/.test(rawTwitterAccountId)
      ? rawTwitterAccountId
      : null
  const twitterUsername = getTwitterUsername(user)
  const optInQuery = twitterUsername
    ? admin
        .from('optin')
        .select('*')
        .or(`user_id.eq.${user.id},username.eq.${twitterUsername}`)
        .limit(1)
        .maybeSingle()
    : admin.from('optin').select('*').eq('user_id', user.id).maybeSingle()

  const [
    optInResponse,
    archivesResponse,
    tweetsResponse,
    settings,
    pendingCommunityProjects,
  ] = await Promise.all([
    optInQuery,
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
    twitterAccountId
      ? supabase
          .from('tweets')
          .select(
            'tweet_id, created_at, full_text, favorite_count, retweet_count',
          )
          .eq('account_id', twitterAccountId)
          .order('created_at', { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [], error: null }),
    twitterAccountId
      ? getPublicProfileSettings(twitterAccountId)
      : Promise.resolve({ downloadArchiveVisible: true }),
    isAdmin
      ? loadPendingCommunityProjects().catch(() => [])
      : Promise.resolve([]),
  ])

  // Tolerate the subscriptions table not existing yet (pre-migration).
  const digestSubscription = twitterAccountId
    ? await getSubscriptionForAccount(twitterAccountId).catch(() => null)
    : null
  const digestEmailStatus: DigestEmailStatus = !digestSubscription
    ? 'none'
    : digestSubscription.unsubscribedAt
      ? 'unsubscribed'
      : 'subscribed'

  return (
    <main className="min-h-screen bg-card dark:bg-background">
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        {isAdmin ? (
          <div className="mb-8">
            <CommunitySubmissionQueue
              initialProjects={pendingCommunityProjects}
            />
          </div>
        ) : null}
        <DigestEmailSettings
          initialStatus={digestEmailStatus}
          initialEmail={
            digestSubscription
              ? maskSubscriptionEmail(digestSubscription.email)
              : null
          }
        />
        <ProfileContent
          user={user}
          accountId={twitterAccountId}
          initialDownloadArchiveVisible={settings.downloadArchiveVisible}
          initialOptInData={optInResponse.data}
          archives={archivesResponse.data || []}
          initialTweets={tweetsResponse.data || []}
        />
      </div>
    </main>
  )
}
