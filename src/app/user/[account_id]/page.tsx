import { cache } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ProfileHeader } from '@/components/metaTwitter/ProfileHeader'
import {
  ArchiveNav,
  type NavChapter,
} from '@/components/metaTwitter/ArchiveNav'
import { Workspace } from '@/components/metaTwitter/Workspace'
import { getClickHouseUserProfile } from '@/lib/clickhouseUserProfile'
import { getProfileBangers } from '@/lib/metaTwitter/bangers'
import { getClickHouseProfileSidebar } from '@/lib/metaTwitter/clickhouseSidebar'
import {
  getCachedArchivedAt,
  getCachedProfileHeader,
  resolveAccountId,
} from '@/lib/metaTwitter/data'
import type { ProfileHeaderData } from '@/lib/metaTwitter/types'

interface PageProps {
  params: { account_id: string }
  searchParams: { chapter?: string }
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
  const [archivedAt, bangers] = await Promise.all([
    profile.has_archive ? getCachedArchivedAt(accountId) : null,
    getProfileBangers(accountId),
  ])

  const requestedYear = searchParams.chapter
    ? Number.parseInt(searchParams.chapter, 10)
    : null
  const year =
    requestedYear &&
    bangers.yearCounts.some((entry) => entry.year === requestedYear)
      ? requestedYear
      : null
  const tweets = year
    ? bangers.tweets.filter(
        (tweet) => new Date(tweet.created_at).getUTCFullYear() === year,
      )
    : bangers.tweets
  const sidebar = await getClickHouseProfileSidebar(
    accountId,
    year ?? undefined,
  )

  const basePath = `/user/${encodeURIComponent(params.account_id)}`
  const navChapters: NavChapter[] = bangers.yearCounts
  const contextTitle = year ? `${year} bangers` : 'Overall — Bangers'
  const contextDesc = bangers.available
    ? `${tweets.length} post${tweets.length === 1 ? '' : 's'} with at least two quote posts from Community Archive members${year ? ` in ${year}` : ''}. Self-quotes are excluded.`
    : 'The Community Archive banger ranking is temporarily unavailable.'

  return (
    <div className="flex justify-center px-4 py-8 sm:px-6">
      <div className="h-fit w-full max-w-[1220px] overflow-hidden rounded-2xl border border-border bg-card shadow-[0_2px_16px_rgba(0,0,0,0.06)]">
        <ProfileHeader profile={profile} archivedAt={archivedAt} />
        <div className="grid grid-cols-1 items-start border-t border-border lg:grid-cols-[250px_1fr]">
          <ArchiveNav
            basePath={basePath}
            chapters={navChapters}
            activeYear={year}
          />
          <Workspace
            key={year ?? 'overall'}
            avatarUrl={profile.avatar_media_url}
            contextTitle={contextTitle}
            contextDesc={contextDesc}
            tweets={tweets}
            bangersAvailable={bangers.available}
            media={sidebar.media}
            mediaCount={sidebar.mediaCount}
            people={sidebar.people}
            peopleTitle={year ? `People in ${year}` : 'Top people'}
          />
        </div>
      </div>
    </div>
  )
}
