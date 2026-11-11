import type { Metadata } from 'next'
import { userProfileHref } from '@/lib/navigation'
import type { ResolvedProfile } from '@/lib/metaTwitter/profile'

/** Shared by the member profile page and its cached guest preview. */
export function profileMetadata({
  accountId,
  profile,
}: ResolvedProfile): Metadata {
  const title = `${profile.account_display_name} (@${profile.username}) — Community Archive`
  const normalizedBio = profile.bio?.replace(/\s+/g, ' ').trim()
  const description = normalizedBio
    ? normalizedBio.length > 200
      ? `${normalizedBio.slice(0, 199).trimEnd()}…`
      : normalizedBio
    : `Explore @${profile.username}'s archived posts on Community Archive.`
  const canonicalPath = userProfileHref(profile.username, accountId)
  return {
    title,
    description,
    alternates: { canonical: canonicalPath },
    robots: { index: false },
    openGraph: {
      type: 'website',
      url: canonicalPath,
      title,
      description,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  }
}
