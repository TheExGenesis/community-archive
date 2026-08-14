import { cache } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ProfileHeader } from '@/components/metaTwitter/ProfileHeader'
import type { NavChapter } from '@/components/metaTwitter/ArchiveNav'
import { ProfileArchive } from '@/components/metaTwitter/ProfileArchive'
import { getClickHouseUserProfile } from '@/lib/clickhouseUserProfile'
import { getProfileBangersPage } from '@/lib/metaTwitter/bangers'
import {
  PROFILE_BANGERS_INITIAL_LIMIT,
  resolveProfileChapterYear,
} from '@/lib/metaTwitter/profilePagination'
import { getClickHouseProfileSidebar } from '@/lib/metaTwitter/clickhouseSidebar'
import {
  getCachedArchivedAt,
  getCachedProfileHeader,
  resolveAccountId,
} from '@/lib/metaTwitter/data'
import type { ProfileHeaderData } from '@/lib/metaTwitter/types'

interface PageProps {
  params: { account_id: string }
  searchParams: { chapter?: string; username?: string }
}

interface ResolvedProfile {
  accountId: string
  profile: ProfileHeaderData
}

const resolveProfile = cache(
  async (param: string): Promise<ResolvedProfile | null> => {
    const archiveAccountId = await resolveAccountId(param)
    if (archiveAccountId) {
      const profile = await getCachedProfileHeader(archiveAccountId)
      if (profile) return { accountId: archiveAccountId, profile }
    }

    const clickHouseProfile = await getClickHouseUserProfile(param)
    const accountId = clickHouseProfile?.user.account_id
    if (!clickHouseProfile || !accountId) return null
    const user = clickHouseProfile.user
    return {
      accountId,
      profile: {
        account_id: accountId,
        username: user.username,
        account_display_name: user.account_display_name,
        created_at: user.created_at,
        num_tweets: user.num_tweets,
        num_followers: user.num_followers,
        num_following: user.num_following,
        num_likes: user.num_likes,
        has_archive: user.has_archive,
        bio: user.bio,
        website: user.website,
        location: user.location,
        avatar_media_url: user.avatar_media_url,
        header_media_url: user.header_media_url ?? null,
      },
    }
  },
)

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const resolved = await resolveProfile(params.account_id)
  if (!resolved) return { title: 'User not found' }
  const { profile } = resolved
  return {
    title: `${profile.account_display_name} (@${profile.username}) — Community Archive`,
    description: profile.bio ?? undefined,
  }
}

export default async function UserPage({ params, searchParams }: PageProps) {
  const resolved = await resolveProfile(params.account_id)
  if (!resolved) notFound()

  const { accountId, profile } = resolved
  const requestedYear = searchParams.chapter
    ? Number.parseInt(searchParams.chapter, 10)
    : null
  const candidateYear =
    requestedYear &&
    requestedYear >= 2006 &&
    requestedYear <= new Date().getUTCFullYear() + 1
      ? requestedYear
      : null

  const [archivedAt, candidatePage, candidateSidebar] = await Promise.all([
    profile.has_archive ? getCachedArchivedAt(accountId) : null,
    getProfileBangersPage(accountId, {
      limit: PROFILE_BANGERS_INITIAL_LIMIT,
      year: candidateYear ?? undefined,
    }),
    getClickHouseProfileSidebar(accountId, candidateYear ?? undefined),
  ])

  const year = resolveProfileChapterYear(candidateYear, candidatePage)
  const [initialPage, sidebar] =
    year === candidateYear
      ? [candidatePage, candidateSidebar]
      : await Promise.all([
          getProfileBangersPage(accountId, {
            limit: PROFILE_BANGERS_INITIAL_LIMIT,
          }),
          getClickHouseProfileSidebar(accountId, undefined),
        ])

  const baseParams = new URLSearchParams()
  if (searchParams.username) {
    baseParams.set('username', searchParams.username)
  }
  const baseQuery = baseParams.toString()
  const basePath = `/user/${encodeURIComponent(params.account_id)}${baseQuery ? `?${baseQuery}` : ''}`
  const navChapters: NavChapter[] = initialPage.yearCounts

  return (
    <div className="flex justify-center px-4 py-8 sm:px-6">
      <div className="h-fit w-full max-w-[1220px] overflow-hidden rounded-2xl border border-border bg-card shadow-[0_2px_16px_rgba(0,0,0,0.06)]">
        <ProfileHeader profile={profile} archivedAt={archivedAt} />
        <ProfileArchive
          accountId={accountId}
          avatarUrl={profile.avatar_media_url}
          basePath={basePath}
          chapters={navChapters}
          initialYear={year}
          initialPage={initialPage}
          initialSidebar={sidebar}
        />
      </div>
    </div>
  )
}
