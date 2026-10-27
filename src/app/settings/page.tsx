import Link from 'next/link'
import { requireAuth } from '@/lib/auth-utils'
import { getPublicProfileSettings } from '@/lib/profileCuration'
import { createServerAdminClient, createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'
import {
  getSubscriptionForAccount,
  maskSubscriptionEmail,
} from '@/lib/digest/emailSubscriptions'
import ProfileContent from '../profile/ProfileContent'
import { agentSearchDailyLimits } from '@/lib/agentSearch/budget'
import { getAgentSearchAccess } from '@/lib/agentSearch/eligibility'
import { ownKeysEnabled } from '@/lib/agentSearch/openRouterKey'
import { AskArchiveSettings } from './AskArchiveSettings'
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
  const cookieStore = await cookies()
  const supabase = createServerClient(cookieStore, { readSource: 'app' })
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
    settings,
    digestSubscription,
    askAccess,
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
        ? getPublicProfileSettings(twitterAccountId, { readSource: 'app' })
        : Promise.resolve({ downloadArchiveVisible: true }),
      twitterAccountId
        ? getSubscriptionForAccount(twitterAccountId).catch(() => null)
        : Promise.resolve(null),
      // Only members who may ask see Ask the archive's setting.
      ownKeysEnabled() ? getAgentSearchAccess() : Promise.resolve(null),
    ])
  const askLimits = askAccess?.ok ? agentSearchDailyLimits() : null

  const digestEmailStatus: DigestEmailStatus = !digestSubscription
    ? 'none'
    : digestSubscription.unsubscribedAt
      ? 'unsubscribed'
      : 'subscribed'

  return (
    <main className="min-h-screen bg-card dark:bg-background">
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <DigestEmailSettings
          initialStatus={digestEmailStatus}
          initialEmail={
            digestSubscription
              ? maskSubscriptionEmail(digestSubscription.email)
              : null
          }
        />
        {askLimits && (
          <AskArchiveSettings
            houseLimit={askLimits.house}
            ownLimit={askLimits.own}
          />
        )}

        <section className="mb-8 flex flex-col gap-3 rounded-lg border bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">API keys</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Read the archive from your own scripts and apps.
            </p>
          </div>
          <Link
            href="/settings/api-keys"
            className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-accent"
          >
            Manage API keys
          </Link>
        </section>
        <ProfileContent
          user={user}
          accountId={twitterAccountId}
          initialDownloadArchiveVisible={settings.downloadArchiveVisible}
          initialOptInData={optInResponse.data}
          archives={archivesResponse.data || []}
        />
      </div>
    </main>
  )
}
