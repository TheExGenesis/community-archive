import 'server-only'

import { unstable_cache } from 'next/cache'
import {
  fetchAnalyticsGatewayJson,
  type AnalyticsGatewayFetcher,
} from '@/lib/clickhouseGateway'
import { devLog } from '@/lib/devLog'
import type { ArchiveMediaItem, ArchivePerson } from './types'

const DAY = 86_400
const MEDIA_LIMIT = 6
const PEOPLE_LIMIT = 8
const OUTREACH_LIMIT = 5
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

interface MediaResponse {
  data?: {
    media?: unknown
    mediaCount?: unknown
  }
  query?: {
    accountId?: unknown
    year?: unknown
    mediaLimit?: unknown
  }
}

interface InteractionsResponse {
  data?: {
    people?: unknown
  }
  query?: {
    accountId?: unknown
    year?: unknown
    peopleLimit?: unknown
    missingOnly?: unknown
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
  inCommunityArchive?: unknown
}

export interface ClickHouseProfileSidebar {
  media: ArchiveMediaItem[]
  mediaCount: number
  people: ArchivePerson[]
}

export interface ClickHouseProfileSidebarState
  extends ClickHouseProfileSidebar {
  available: boolean
}

export interface ClickHouseProfileMedia {
  media: ArchiveMediaItem[]
  mediaCount: number
}

export interface ClickHouseProfileMediaState extends ClickHouseProfileMedia {
  available: boolean
}

export interface ClickHouseProfileInteractions {
  people: ArchivePerson[]
}

export interface ClickHouseProfileInteractionsState
  extends ClickHouseProfileInteractions {
  available: boolean
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
      typeof row.avatarUrl === 'string' && row.avatarUrl.trim()
        ? row.avatarUrl
        : null,
    in_archive: row.inCommunityArchive !== false,
  }
}

const profileParams = (year: number | undefined, limit: number) => {
  const params = new URLSearchParams({ limit: String(limit) })
  if (year !== undefined) params.set('year', String(year))
  return params
}

export async function fetchClickHouseProfileMedia(
  accountId: string,
  year: number | undefined,
  fetcher: AnalyticsGatewayFetcher = fetchAnalyticsGatewayJson,
): Promise<ClickHouseProfileMedia> {
  if (!ID_PATTERN.test(accountId)) {
    throw new Error('Profile media requires a numeric account ID')
  }
  const response = await fetcher<MediaResponse>(
    ['user', accountId, 'media'],
    profileParams(year, MEDIA_LIMIT),
    { timeoutMs: 30_000 },
  )
  if (
    response.query?.accountId !== accountId ||
    response.query?.year !== (year ?? null) ||
    Number(response.query?.mediaLimit) !== MEDIA_LIMIT
  ) {
    throw new Error('ClickHouse returned mismatched profile media scope')
  }
  const media = response.data?.media
  const mediaCount = safeCount(response.data?.mediaCount)
  if (mediaCount === null || !Array.isArray(media)) {
    throw new Error('ClickHouse returned invalid profile media')
  }
  return {
    media: media.flatMap((value) => {
      const item = mediaItem(value)
      return item ? [item] : []
    }),
    mediaCount,
  }
}

export async function fetchClickHouseProfileInteractions(
  accountId: string,
  year: number | undefined,
  fetcher: AnalyticsGatewayFetcher = fetchAnalyticsGatewayJson,
): Promise<ClickHouseProfileInteractions> {
  if (!ID_PATTERN.test(accountId)) {
    throw new Error('Profile interactions require a numeric account ID')
  }
  const response = await fetcher<InteractionsResponse>(
    ['user', accountId, 'interactions'],
    profileParams(year, PEOPLE_LIMIT),
    { timeoutMs: 30_000 },
  )
  if (
    response.query?.accountId !== accountId ||
    response.query?.year !== (year ?? null) ||
    Number(response.query?.peopleLimit) !== PEOPLE_LIMIT
  ) {
    throw new Error('ClickHouse returned mismatched profile interactions scope')
  }
  const people = response.data?.people
  if (!Array.isArray(people)) {
    throw new Error('ClickHouse returned invalid profile interactions')
  }
  return {
    people: people.flatMap((value) => {
      const item = personItem(value)
      return item ? [item] : []
    }),
  }
}

export async function fetchClickHouseProfileOutreach(
  accountId: string,
  fetcher: AnalyticsGatewayFetcher = fetchAnalyticsGatewayJson,
): Promise<ClickHouseProfileInteractions> {
  if (!ID_PATTERN.test(accountId)) {
    throw new Error('Profile outreach requires a numeric account ID')
  }
  const params = profileParams(undefined, OUTREACH_LIMIT)
  params.set('missing_only', 'true')
  const response = await fetcher<InteractionsResponse>(
    ['user', accountId, 'interactions'],
    params,
    { timeoutMs: 30_000 },
  )
  if (
    response.query?.accountId !== accountId ||
    response.query?.year !== null ||
    Number(response.query?.peopleLimit) !== OUTREACH_LIMIT ||
    response.query?.missingOnly !== true
  ) {
    throw new Error('ClickHouse returned mismatched profile outreach scope')
  }
  const people = response.data?.people
  if (!Array.isArray(people)) {
    throw new Error('ClickHouse returned invalid profile outreach')
  }
  return {
    people: people.flatMap((value) => {
      const item = personItem(value)
      return item && item.in_archive === false ? [item] : []
    }),
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
  ['meta-twitter-clickhouse-profile-sidebar-v2'],
  { revalidate: DAY },
)

const getCachedClickHouseProfileMedia = unstable_cache(
  fetchClickHouseProfileMedia,
  ['meta-twitter-clickhouse-profile-media-v1'],
  { revalidate: DAY },
)

const getCachedClickHouseProfileInteractions = unstable_cache(
  fetchClickHouseProfileInteractions,
  ['meta-twitter-clickhouse-profile-interactions-v1'],
  { revalidate: DAY },
)

export async function getClickHouseProfileSidebarOrThrow(
  accountId: string,
  year: number | undefined,
): Promise<ClickHouseProfileSidebar> {
  return getCachedClickHouseProfileSidebar(accountId, year)
}

export async function getClickHouseProfileMediaOrThrow(
  accountId: string,
  year: number | undefined,
): Promise<ClickHouseProfileMedia> {
  return getCachedClickHouseProfileMedia(accountId, year)
}

export async function getClickHouseProfileInteractionsOrThrow(
  accountId: string,
  year: number | undefined,
): Promise<ClickHouseProfileInteractions> {
  return getCachedClickHouseProfileInteractions(accountId, year)
}

export async function getClickHouseProfileSidebar(
  accountId: string,
  year: number | undefined,
): Promise<ClickHouseProfileSidebarState> {
  try {
    return {
      ...(await getClickHouseProfileSidebarOrThrow(accountId, year)),
      available: true,
    }
  } catch (error) {
    devLog('metaTwitter getClickHouseProfileSidebar error', {
      accountId,
      year,
      error,
    })
    return { media: [], mediaCount: 0, people: [], available: false }
  }
}

export async function getClickHouseProfileMedia(
  accountId: string,
  year: number | undefined,
): Promise<ClickHouseProfileMediaState> {
  try {
    return {
      ...(await getClickHouseProfileMediaOrThrow(accountId, year)),
      available: true,
    }
  } catch (error) {
    devLog('metaTwitter getClickHouseProfileMedia error', {
      accountId,
      year,
      error,
    })
    return { media: [], mediaCount: 0, available: false }
  }
}

export async function getClickHouseProfileInteractions(
  accountId: string,
  year: number | undefined,
): Promise<ClickHouseProfileInteractionsState> {
  try {
    return {
      ...(await getClickHouseProfileInteractionsOrThrow(accountId, year)),
      available: true,
    }
  } catch (error) {
    devLog('metaTwitter getClickHouseProfileInteractions error', {
      accountId,
      year,
      error,
    })
    return { people: [], available: false }
  }
}
