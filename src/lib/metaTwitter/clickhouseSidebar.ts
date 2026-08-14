import 'server-only'

import { unstable_cache } from 'next/cache'
import {
  fetchAnalyticsGatewayJson,
  type AnalyticsGatewayFetcher,
} from '@/lib/clickhouseGateway'
import { getHighResolutionAvatarUrl } from '@/lib/avatar'
import { devLog } from '@/lib/devLog'
import type { ArchiveMediaItem, ArchivePerson } from './types'

const DAY = 86_400
const MEDIA_LIMIT = 18
const PEOPLE_LIMIT = 8
const ID_PATTERN = /^\d{1,20}$/

interface SidebarResponse {
  data?: {
    media?: unknown
    mediaCount?: unknown
    people?: unknown
  }
  query?: {
    accountId?: unknown
    year?: unknown
    mediaLimit?: unknown
    peopleLimit?: unknown
  }
}

interface SidebarMediaRow {
  tweetId?: unknown
  createdAt?: unknown
  favoriteCount?: unknown
  mediaUrl?: unknown
  mediaType?: unknown
  width?: unknown
  height?: unknown
}

interface SidebarPersonRow {
  accountId?: unknown
  username?: unknown
  displayName?: unknown
  avatarUrl?: unknown
  interactionCount?: unknown
}

export interface ClickHouseProfileSidebar {
  media: ArchiveMediaItem[]
  mediaCount: number
  people: ArchivePerson[]
}

const safeCount = (value: unknown): number | null => {
  const count = Number(value)
  return Number.isSafeInteger(count) && count >= 0 ? count : null
}

const safeTimestamp = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.trim()) return null
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

const mediaItem = (value: unknown): ArchiveMediaItem | null => {
  const row = value as SidebarMediaRow
  const createdAt = safeTimestamp(row?.createdAt)
  const favoriteCount = safeCount(row?.favoriteCount)
  const width = safeCount(row?.width)
  const height = safeCount(row?.height)
  if (
    typeof row?.tweetId !== 'string' ||
    !ID_PATTERN.test(row.tweetId) ||
    !createdAt ||
    favoriteCount === null ||
    typeof row.mediaUrl !== 'string' ||
    !row.mediaUrl.trim() ||
    typeof row.mediaType !== 'string' ||
    !row.mediaType.trim() ||
    width === null ||
    height === null
  ) {
    return null
  }
  return {
    tweet_id: row.tweetId,
    created_at: createdAt,
    favorite_count: favoriteCount,
    media_url: row.mediaUrl,
    media_type: row.mediaType,
    width,
    height,
  }
}

const personItem = (value: unknown): ArchivePerson | null => {
  const row = value as SidebarPersonRow
  const interactions = safeCount(row?.interactionCount)
  if (
    typeof row?.accountId !== 'string' ||
    !ID_PATTERN.test(row.accountId) ||
    typeof row.username !== 'string' ||
    !row.username.trim() ||
    interactions === null
  ) {
    return null
  }
  return {
    user_id: row.accountId,
    screen_name: row.username,
    name:
      typeof row.displayName === 'string' && row.displayName.trim()
        ? row.displayName
        : null,
    interactions,
    avatar_media_url:
      getHighResolutionAvatarUrl(
        typeof row.avatarUrl === 'string' ? row.avatarUrl : null,
      ) ?? null,
    in_archive: true,
  }
}

export async function fetchClickHouseProfileSidebar(
  accountId: string,
  year: number | undefined,
  fetcher: AnalyticsGatewayFetcher = fetchAnalyticsGatewayJson,
): Promise<ClickHouseProfileSidebar> {
  if (!ID_PATTERN.test(accountId)) {
    throw new Error('Profile sidebar requires a numeric account ID')
  }
  const params = new URLSearchParams({
    media_limit: String(MEDIA_LIMIT),
    people_limit: String(PEOPLE_LIMIT),
  })
  if (year !== undefined) params.set('year', String(year))

  const response = await fetcher<SidebarResponse>(
    ['user', accountId, 'sidebar'],
    params,
    { timeoutMs: 30_000 },
  )
  if (
    response.query?.accountId !== accountId ||
    response.query?.year !== (year ?? null) ||
    Number(response.query?.mediaLimit) !== MEDIA_LIMIT ||
    Number(response.query?.peopleLimit) !== PEOPLE_LIMIT
  ) {
    throw new Error('ClickHouse returned a mismatched profile sidebar scope')
  }
  const media = response.data?.media
  const people = response.data?.people
  const mediaCount = safeCount(response.data?.mediaCount)
  if (mediaCount === null || !Array.isArray(media) || !Array.isArray(people)) {
    throw new Error('ClickHouse returned an invalid profile sidebar')
  }

  return {
    media: media.flatMap((value) => {
      const item = mediaItem(value)
      return item ? [item] : []
    }),
    mediaCount,
    people: people.flatMap((value) => {
      const item = personItem(value)
      return item ? [item] : []
    }),
  }
}

const getCachedClickHouseProfileSidebar = unstable_cache(
  fetchClickHouseProfileSidebar,
  ['meta-twitter-clickhouse-profile-sidebar-v1'],
  { revalidate: DAY },
)

export async function getClickHouseProfileSidebar(
  accountId: string,
  year: number | undefined,
): Promise<ClickHouseProfileSidebar> {
  try {
    return await getCachedClickHouseProfileSidebar(accountId, year)
  } catch (error) {
    devLog('metaTwitter getClickHouseProfileSidebar error', {
      accountId,
      year,
      error,
    })
    return { media: [], mediaCount: 0, people: [] }
  }
}
