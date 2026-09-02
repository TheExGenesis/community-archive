import { Suspense } from 'react'
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { ProfileHeader } from '@/components/metaTwitter/ProfileHeader'
import type { NavChapter } from '@/components/metaTwitter/ArchiveNav'
import { ProfileArchive } from '@/components/metaTwitter/ProfileArchive'
import { ProfileArchiveSkeleton } from '@/components/metaTwitter/ProfilePageSkeleton'
import { ProfileEditingProvider } from '@/components/metaTwitter/ProfileEditingContext'
import { userProfileHref } from '@/lib/navigation'
import {
  getCuratedProfileBangersPage,
  getPublicProfileSettings,
} from '@/lib/profileCuration'
import { getAuthenticatedAccountId } from '@/lib/authenticatedAccount'
import {
  PROFILE_BANGERS_INITIAL_LIMIT,
  resolveProfileChapterYear,
} from '@/lib/metaTwitter/profilePagination'
import { getCachedArchivedAt } from '@/lib/metaTwitter/data'
import { resolveProfile } from '@/lib/metaTwitter/profile'
import type { SectionsByYear } from '@/lib/metaTwitter/chapterSections'
import { configuredSectionsByYear } from '@/lib/metaTwitter/sectionConfig'

// Uncached profiles wait on the analytics gateway for the header media backfill
// and the first banger page. When the gateway is slow those can exceed Vercel's
// 15s default, which aborts the RSC stream mid-render and surfaces client-side
// as "Connection closed". Match the other ClickHouse-backed pages.
export const maxDuration = 60

interface PageProps {
  params: { account_id: string }
  searchParams: { chapter?: string; section?: string; username?: string }
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const resolved = await resolveProfile(params.account_id)
  if (!resolved) return { title: 'User not found' }
  const { accountId, profile } = resolved
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

async function ProfileArchiveContent({
  accountId,
  avatarUrl,
  basePath,
  candidateYear,
  candidateSection,
  displayName,
}: {
  accountId: string
  avatarUrl: string | null
  basePath: string
  candidateYear: number | null
  candidateSection: string | null
  displayName: string
}) {
  const candidatePage = await getCuratedProfileBangersPage(accountId, {
    limit: PROFILE_BANGERS_INITIAL_LIMIT,
    year: candidateYear ?? undefined,
  })

  const year = resolveProfileChapterYear(candidateYear, candidatePage)
  const initialPage =
    year === candidateYear
      ? candidatePage
      : await getCuratedProfileBangersPage(accountId, {
          limit: PROFILE_BANGERS_INITIAL_LIMIT,
        })

  const navChapters: NavChapter[] = initialPage.yearCounts

  // Sections are configured per account (curated or generated offline); when
  // banger data is unavailable we make no claim about them at all.
  const sectionsByYear: SectionsByYear =
    (initialPage.available && configuredSectionsByYear(accountId)) || {}

  return (
    <ProfileArchive
      accountId={accountId}
      avatarUrl={avatarUrl}
      basePath={basePath}
      chapters={navChapters}
      displayName={displayName}
      initialYear={year}
      initialSectionSlug={year === candidateYear ? candidateSection : null}
      initialPage={initialPage}
      sectionsByYear={sectionsByYear}
    />
  )
}

async function ProfileArchivedAt({ accountId }: { accountId: string }) {
  const archivedAt = await getCachedArchivedAt(accountId)
  if (!archivedAt) return null
  return (
    <span>
      🗄️ Archived{' '}
      {new Date(archivedAt).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      })}
    </span>
  )
}

export default async function UserPage({ params, searchParams }: PageProps) {
  const resolved = await resolveProfile(params.account_id)
  if (!resolved) notFound()

  const { accountId, profile } = resolved
  const [settings, authenticatedAccountId] = await Promise.all([
    getPublicProfileSettings(accountId),
    getAuthenticatedAccountId(),
  ])
  const isOwner = authenticatedAccountId === accountId
  const requestedYear = searchParams.chapter
    ? Number.parseInt(searchParams.chapter, 10)
    : null
  const candidateYear =
    requestedYear &&
    requestedYear >= 2006 &&
    requestedYear <= new Date().getUTCFullYear() + 1
      ? requestedYear
      : null
  // Sections may be generated during render, so the slug is validated inside
  // the archive content; here it only has to be shaped like a slug.
  const candidateSection =
    candidateYear &&
    searchParams.section &&
    /^[a-z0-9-]{1,64}$/.test(searchParams.section)
      ? searchParams.section
      : null

  const requestedProfilePath = `/user/${encodeURIComponent(params.account_id)}`
  const canonicalProfilePath = userProfileHref(profile.username, accountId)
  if (canonicalProfilePath !== requestedProfilePath) {
    const canonicalParams = new URLSearchParams()
    if (candidateYear) canonicalParams.set('chapter', String(candidateYear))
    if (candidateSection) canonicalParams.set('section', candidateSection)
    const canonicalQuery = canonicalParams.toString()
    redirect(
      `${canonicalProfilePath}${canonicalQuery ? `?${canonicalQuery}` : ''}`,
    )
  }

  return (
    <div className="flex justify-center px-4 pb-8 pt-4 sm:px-6">
      <div className="h-fit w-full max-w-[1220px] overflow-hidden rounded-lg border border-border bg-card shadow-[0_2px_16px_rgba(0,0,0,0.06)]">
        <ProfileEditingProvider>
          <ProfileHeader
            profile={profile}
            downloadArchiveVisible={settings.downloadArchiveVisible}
            archivedAt={null}
            archivedAtSlot={
              profile.has_archive ? (
                <Suspense fallback={null}>
                  <ProfileArchivedAt accountId={accountId} />
                </Suspense>
              ) : null
            }
            isOwner={isOwner}
          />
          <Suspense fallback={<ProfileArchiveSkeleton />}>
            <ProfileArchiveContent
              accountId={accountId}
              avatarUrl={profile.avatar_media_url}
              basePath={canonicalProfilePath}
              candidateYear={candidateYear}
              candidateSection={candidateSection}
              displayName={profile.account_display_name}
            />
          </Suspense>
        </ProfileEditingProvider>
      </div>
    </div>
  )
}
