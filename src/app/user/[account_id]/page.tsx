import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ProfileHeader } from '@/components/metaTwitter/ProfileHeader'
import { ArchiveNav, NavChapter } from '@/components/metaTwitter/ArchiveNav'
import {
  Workspace,
  WorkspacePill,
} from '@/components/metaTwitter/Workspace'
import {
  getCachedActiveYears,
  getCachedArchivedAt,
  getCachedChapterData,
  getCachedProfileHeader,
  getCachedTweetsByIds,
  resolveAccountId,
  type ArchiveTweet,
} from '@/lib/metaTwitter/data'
import { getMetaTwitterConfig, type TopicConfig } from '@/lib/metaTwitter/config'

interface PageProps {
  params: { account_id: string }
  searchParams: { chapter?: string; topic?: string }
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const accountId = await resolveAccountId(params.account_id)
  if (!accountId) return { title: 'User not found' }
  const profile = await getCachedProfileHeader(accountId)
  if (!profile) return { title: 'User not found' }
  return {
    title: `${profile.account_display_name} (@${profile.username}) — Community Archive`,
    description: profile.bio ?? undefined,
  }
}

export default async function UserPage({ params, searchParams }: PageProps) {
  const accountId = await resolveAccountId(params.account_id)
  if (!accountId) notFound()

  const [profile, archivedAt, activeYears] = await Promise.all([
    getCachedProfileHeader(accountId),
    getCachedArchivedAt(accountId),
    getCachedActiveYears(accountId),
  ])
  if (!profile) notFound()

  const config = getMetaTwitterConfig(accountId)
  const basePath = `/user/${encodeURIComponent(params.account_id)}`

  // --- Resolve the selected chapter/topic from the URL ---
  const requestedYear = searchParams.chapter
    ? parseInt(searchParams.chapter, 10)
    : null
  const year =
    requestedYear && activeYears.some((y) => y.year === requestedYear)
      ? requestedYear
      : null
  const isOverall = year === null

  const chapterConfig = year
    ? (config?.chapters.find((c) => c.year === year) ?? null)
    : null
  const availableTopics: TopicConfig[] = isOverall
    ? (config?.overallTopics ?? [])
    : (chapterConfig?.topics ?? [])
  const topic =
    (searchParams.topic &&
      availableTopics.find((t) => t.slug === searchParams.topic)) ||
    null

  // --- Fetch workspace data for the selected scope ---
  const chapterData = await getCachedChapterData(
    accountId,
    year ?? undefined,
    topic?.terms,
  )
  const hofIds = config?.hallOfFamePinned ?? []
  const pinnedTweets: ArchiveTweet[] =
    isOverall && !topic && hofIds.length > 0
      ? await getCachedTweetsByIds(accountId, hofIds)
      : []

  const seen = new Set<string>()
  const tweets = [
    ...pinnedTweets,
    ...chapterData.topTweets,
    ...chapterData.newestTweets,
  ].filter((t) => {
    if (seen.has(t.tweet_id)) return false
    seen.add(t.tweet_id)
    return true
  })

  // --- Presentation strings ---
  const contextTitle = isOverall
    ? topic
      ? `Overall → ${topic.label}`
      : 'Hall of Fame'
    : topic
      ? `${year} → ${topic.label}`
      : String(year)
  const contextDesc = topic
    ? (topic.description ?? null)
    : isOverall
      ? (config?.overallDescription ??
        `The best of @${profile.username}'s archive.`)
      : (chapterConfig?.description ?? null)

  const pills: WorkspacePill[] = availableTopics.map((t) => {
    const active = topic?.slug === t.slug
    const chapterParam = year ? `chapter=${year}&` : ''
    return {
      label: t.label,
      slug: t.slug,
      active,
      // Clicking the active pill deselects it (back to the bare chapter).
      href: active
        ? `${basePath}${year ? `?chapter=${year}` : ''}`
        : `${basePath}?${chapterParam}topic=${t.slug}`,
    }
  })

  const navChapters: NavChapter[] = activeYears.map((y) => ({
    year: y.year,
    count: y.count,
    topics: (config?.chapters.find((c) => c.year === y.year)?.topics ?? []).map(
      (t) => ({ label: t.label, slug: t.slug }),
    ),
  }))

  return (
    <div className="flex justify-center px-4 py-8 sm:px-6">
      <div className="h-fit w-full max-w-[1220px] overflow-hidden rounded-2xl border border-border bg-card shadow-[0_2px_16px_rgba(0,0,0,0.06)]">
        <ProfileHeader profile={profile} archivedAt={archivedAt} />
        <div className="grid grid-cols-1 items-start border-t border-border lg:grid-cols-[250px_1fr]">
          <ArchiveNav
            basePath={basePath}
            chapters={navChapters}
            activeYear={year}
            activeTopicSlug={topic?.slug ?? null}
          />
          <Workspace
            accountId={accountId}
            username={profile.username}
            displayName={profile.account_display_name}
            avatarUrl={profile.avatar_media_url}
            isOverall={isOverall}
            contextTitle={contextTitle}
            contextDesc={contextDesc}
            pills={pills}
            tweets={tweets}
            hofIds={hofIds}
            media={chapterData.media}
            mediaCount={chapterData.mediaCount}
            people={chapterData.people}
            peopleTitle={isOverall ? 'Top mutuals' : 'People in this chapter'}
          />
        </div>
      </div>
    </div>
  )
}
