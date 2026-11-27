import { getBrowsingUser } from '@/lib/browsingAuth'
import GuestProfile from '@/components/metaTwitter/GuestProfile'
import { Suspense } from 'react'
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import {
  ProfileHeader,
  ProfileBio,
  ProfileOwnerActions,
} from '@/components/metaTwitter/ProfileHeader'
import type { NavChapter } from '@/components/metaTwitter/ArchiveNav'
import {
  ProfileAvatar,
  ProfileAvatarPlaceholder,
} from '@/components/metaTwitter/ProfileAvatar'
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
import {
  resolveProfileCore,
  withBackfilledMedia,
} from '@/lib/metaTwitter/profile'
import { profileMetadata } from '@/lib/metaTwitter/profileMetadata'
import { getCachedProfileLinks } from '@/lib/profileLinks'
import { measureServerRead } from '@/lib/performance/server'
import type { ProfileHeaderData } from '@/lib/metaTwitter/types'
import Image from 'next/image'
import { SectionReady } from '@/components/PagePerformance'
import type { SectionsByYear } from '@/lib/metaTwitter/chapterSections'
import { configuredSectionsByYear } from '@/lib/metaTwitter/sectionConfig'
import { ProfileStats } from '@/components/metaTwitter/ProfileStats'
import {
  profileAllTimeThemes,
  profileThemesByYear,
} from '@/lib/metaTwitter/themeConfig'
import type { ProfileYearThemes } from '@/lib/metaTwitter/profileThemes'

// A cold profile waits on several gateway reads; Vercel's 15s default cut
// streamed renders off mid-way (504).
export const dynamic = 'force-dynamic'

export const maxDuration = 60

interface PageProps {
  params: Promise<{ account_id: string }>
  searchParams: Promise<{
    chapter?: string
    section?: string
    username?: string
  }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { account_id } = await params
  const resolved = await resolveProfileCore(account_id)
  if (!resolved) return { title: 'User not found' }
  return profileMetadata(resolved)
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
  const candidatePage = await measureServerRead('profile.archive-page', () =>
    getCuratedProfileBangersPage(accountId, {
      limit: PROFILE_BANGERS_INITIAL_LIMIT,
      year: candidateYear ?? undefined,
    }),
  )

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

/** The latest year's themes (this year, when generated) and all time. */
function profileThemePeriods(accountId: string): ProfileYearThemes[] {
  const currentYear = new Date().getUTCFullYear()
  const latestYear = Object.entries(profileThemesByYear(accountId) ?? {})
    .map(([year, entry]) => ({ year: Number(year), entry }))
    .filter(({ year }) => year <= currentYear)
    .sort((left, right) => right.year - left.year)[0]?.entry
  const allTime = profileAllTimeThemes(accountId)
  return [latestYear, allTime].filter((entry): entry is ProfileYearThemes =>
    Boolean(entry),
  )
}

async function ProfileArchivedAt({ accountId }: { accountId: string }) {
  const archivedAt = await measureServerRead('profile.archived-at', () =>
    getCachedArchivedAt(accountId),
  )
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
  const [{ account_id }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ])
  const [viewer, resolved] = await Promise.all([
    getBrowsingUser(),
    resolveProfileCore(account_id),
  ])
  if (!resolved) notFound()

  const { accountId, profile } = resolved
  const requestedYear = resolvedSearchParams.chapter
    ? Number.parseInt(resolvedSearchParams.chapter, 10)
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
    resolvedSearchParams.section &&
    /^[a-z0-9-]{1,64}$/.test(resolvedSearchParams.section)
      ? resolvedSearchParams.section
      : null

  const requestedProfilePath = `/user/${encodeURIComponent(account_id)}`
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

  // Guest document requests are rewritten to the cached /guest route by the
  // middleware; this covers anything that still reaches the dynamic page.
  if (!viewer) {
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

  return (
    <div className="flex justify-center px-4 pb-8 pt-4 sm:px-6">
      <div className="h-fit w-full max-w-[1220px] overflow-hidden rounded-lg border border-border bg-card shadow-[0_2px_16px_rgba(0,0,0,0.06)]">
        <ProfileEditingProvider>
          <SectionReady section="profile_header" />
          <ProfileHeader
            profile={profile}
            archivedAt={null}
            archivedAtSlot={
              profile.has_archive ? (
                <Suspense fallback={null}>
                  <ProfileArchivedAt accountId={accountId} />
                </Suspense>
              ) : null
            }
            avatarSlot={
              profile.avatar_media_url ? undefined : (
                <Suspense
                  fallback={
                    <ProfileAvatarPlaceholder
                      displayName={profile.account_display_name}
                    />
                  }
                >
                  <OptionalProfileAvatar profile={profile} />
                </Suspense>
              )
            }
            bannerSlot={
              <Suspense fallback={null}>
                <OptionalProfileBanner profile={profile} />
              </Suspense>
            }
            bioSlot={
              <Suspense fallback={<ProfileBio profile={profile} />}>
                <OptionalProfileBio profile={profile} />
              </Suspense>
            }
            ownerActionsSlot={
              <Suspense fallback={null}>
                <OwnerActions profile={profile} />
              </Suspense>
            }
          />
          <ProfileStats
            displayName={profile.account_display_name}
            themeYears={profileThemePeriods(accountId)}
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

async function OptionalProfileAvatar({
  profile,
}: {
  profile: ProfileHeaderData
}) {
  const enriched = await withBackfilledMedia(profile, profile.account_id)
  return (
    <ProfileAvatar
      accountId={profile.account_id}
      avatarUrl={enriched.avatar_media_url}
      displayName={profile.account_display_name}
    />
  )
}

async function OptionalProfileBanner({
  profile,
}: {
  profile: ProfileHeaderData
}) {
  if (profile.header_media_url) return null
  const enriched = await withBackfilledMedia(profile, profile.account_id)
  const url = enriched.header_media_url
  return url ? (
    <Image
      src={`${url.replace(/\/$/, '')}/1500x500`}
      alt=""
      fill
      unoptimized
      sizes="(max-width: 1220px) 100vw, 1220px"
      className="object-cover"
    />
  ) : null
}

async function OptionalProfileBio({ profile }: { profile: ProfileHeaderData }) {
  const links = await measureServerRead('profile.optional-links', () =>
    getCachedProfileLinks([profile.bio, profile.website]),
  )
  return <ProfileBio profile={{ ...profile, profile_links: links }} />
}

async function OwnerActions({ profile }: { profile: ProfileHeaderData }) {
  const owner = await measureServerRead(
    'profile.owner',
    getAuthenticatedAccountId,
  )
  if (owner !== profile.account_id) return null
  const settings = await measureServerRead('profile.settings', () =>
    getPublicProfileSettings(profile.account_id),
  )
  return (
    <ProfileOwnerActions
      profile={profile}
      downloadArchiveVisible={settings.downloadArchiveVisible}
    />
  )
}
