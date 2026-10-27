import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import GuestProfile from '@/components/metaTwitter/GuestProfile'
import { userProfileHref } from '@/lib/navigation'
import { resolveProfileCore } from '@/lib/metaTwitter/profile'
import { profileMetadata } from '@/lib/metaTwitter/profileMetadata'

/**
 * The signed-out view of /user/[account_id]. The middleware rewrites guest
 * document requests here so this page can be rendered once and served from
 * the cache, while members keep the dynamic profile. It never reads the
 * request: every guest sees the same preview.
 *
 * The eligibility lookup behind resolveProfileCore is normally uncached; the
 * five-minute window here is how long a newly opted-out account can keep
 * showing its name and bio to signed-out visitors.
 */
export const dynamic = 'force-static'
export const revalidate = 300

interface PageProps {
  params: Promise<{ account_id: string }>
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { account_id } = await params
  const resolved = await resolveProfileCore(account_id)
  if (!resolved) return { title: 'User not found' }
  return profileMetadata(resolved)
}

export default async function GuestProfilePage({ params }: PageProps) {
  const { account_id } = await params
  const resolved = await resolveProfileCore(account_id)
  if (!resolved) notFound()

  const { accountId, profile } = resolved
  const requestedProfilePath = `/user/${encodeURIComponent(account_id)}`
  const canonicalProfilePath = userProfileHref(profile.username, accountId)
  // Sends the browser to the public URL; the middleware rewrites it back here.
  if (canonicalProfilePath !== requestedProfilePath)
    redirect(canonicalProfilePath)

  return (
    <GuestProfile
      displayName={profile.account_display_name}
      username={profile.username}
      bio={profile.bio}
      avatarUrl={profile.avatar_media_url}
      basePath={canonicalProfilePath}
    />
  )
}
