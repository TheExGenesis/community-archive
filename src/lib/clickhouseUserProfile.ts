import 'server-only'
import { fetchAnalyticsGatewayJson } from '@/lib/clickhouseGateway'
import type { FormattedUser } from '@/lib/types'

interface ClickHouseUserResponse {
  data?: {
    account?: {
      accountId?: unknown
      username?: unknown
      displayName?: unknown
      bio?: unknown
      avatarUrl?: unknown
      headerUrl?: unknown
      followers?: unknown
      following?: unknown
      statusCount?: unknown
    }
  }
}

const optionalText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null

const optionalCount = (value: unknown): number | null => {
  const count = Number(value)
  return Number.isSafeInteger(count) && count >= 0 ? count : null
}

export async function getClickHouseUserProfile(
  identifier: string,
): Promise<FormattedUser | null> {
  try {
    const response = await fetchAnalyticsGatewayJson<ClickHouseUserResponse>(
      ['user', identifier],
      new URLSearchParams({ limit: '1' }),
      { revalidate: 300, timeoutMs: 8_000 },
    )
    const account = response.data?.account
    const accountId = optionalText(account?.accountId)
    const username = optionalText(account?.username)
    if (!accountId || !/^\d{1,20}$/.test(accountId) || !username) return null

    return {
      account_id: accountId,
      username,
      account_display_name: optionalText(account?.displayName) || username,
      created_at: null,
      bio: optionalText(account?.bio),
      website: null,
      location: null,
      avatar_media_url: optionalText(account?.avatarUrl),
      header_media_url: optionalText(account?.headerUrl),
      archive_at: null,
      num_tweets: optionalCount(account?.statusCount),
      num_followers: optionalCount(account?.followers),
      num_following: optionalCount(account?.following),
      num_likes: null,
      archive_uploaded_at: null,
      joined_at: null,
      has_archive: false,
      is_opted_in: false,
    }
  } catch {
    return null
  }
}
