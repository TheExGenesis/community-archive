import 'server-only'

import {
  fetchAnalyticsGatewayJson,
  type AnalyticsGatewayFetcher,
} from '@/lib/clickhouseGateway'
import type { DirectoryUser, UserDirectoryPage } from '@/lib/types'

interface ClickHouseMemberDirectoryResponse {
  data: {
    users: Array<{
      directoryId: string
      accountId: string | null
      username: string
      displayName: string
      avatarUrl: string | null
      followerCount: string | number | null
      joinedAt: string | null
      hasArchive: boolean
      isOptedIn: boolean
    }>
  }
  pagination: {
    hasMore: boolean
  }
}

function mapDirectoryUser(
  user: ClickHouseMemberDirectoryResponse['data']['users'][number],
): DirectoryUser {
  const followerCount =
    user.followerCount === null ? null : Number(user.followerCount)
  if (
    !user.directoryId ||
    !user.username ||
    !user.displayName ||
    (user.accountId !== null && !/^\d{1,20}$/.test(user.accountId)) ||
    (followerCount !== null &&
      (!Number.isSafeInteger(followerCount) || followerCount < 0)) ||
    typeof user.hasArchive !== 'boolean' ||
    typeof user.isOptedIn !== 'boolean'
  ) {
    throw new Error('ClickHouse returned an invalid member-directory user')
  }

  return {
    directory_id: user.directoryId,
    account_id: user.accountId,
    username: user.username,
    account_display_name: user.displayName,
    avatar_media_url: user.avatarUrl,
    num_followers: followerCount,
    has_archive: user.hasArchive,
    is_opted_in: user.isOptedIn,
    opted_in_at: null,
    archive_uploaded_at: null,
    joined_at: user.joinedAt,
  }
}

export async function getUserDirectoryPage(
  searchParams = new URLSearchParams({ limit: '15' }),
  fetcher: AnalyticsGatewayFetcher = fetchAnalyticsGatewayJson,
): Promise<UserDirectoryPage> {
  const response = await fetcher<ClickHouseMemberDirectoryResponse>(
    ['member-directory'],
    searchParams,
    { revalidate: 30, timeoutMs: 8_000 },
  )
  if (
    !response?.data ||
    !Array.isArray(response.data.users) ||
    typeof response.pagination?.hasMore !== 'boolean'
  ) {
    throw new Error('ClickHouse returned an invalid member-directory response')
  }
  return {
    users: response.data.users.map(mapDirectoryUser),
    hasMore: response.pagination.hasMore,
  }
}
