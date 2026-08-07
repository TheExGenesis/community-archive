import type { AvatarType } from '@/lib/types'

type TopFollowedAccount = {
  accountId?: unknown
  username?: unknown
  avatarUrl?: unknown
  followerCount?: unknown
}

type TopFollowedAccountsResponse = {
  data?: unknown
}

const DEFAULT_LIMIT = 7
const MAX_LIMIT = 30
const ACCOUNT_ID_PATTERN = /^\d{1,20}$/

export async function getTopFollowedAccounts(
  requestedLimit = DEFAULT_LIMIT,
): Promise<AvatarType[]> {
  const apiUrl = process.env.CLICKHOUSE_ANALYTICS_API_URL?.replace(/\/$/, '')
  const token = process.env.CLICKHOUSE_ANALYTICS_API_TOKEN

  if (!apiUrl || !token) {
    throw new Error('ClickHouse analytics API is not configured')
  }

  const finiteLimit = Number.isFinite(requestedLimit)
    ? requestedLimit
    : DEFAULT_LIMIT
  const limit = Math.max(
    1,
    Math.min(MAX_LIMIT, Math.trunc(finiteLimit || DEFAULT_LIMIT)),
  )
  const response = await fetch(
    `${apiUrl}/top-followed-accounts?limit=${limit}`,
    {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      next: { revalidate: 60 },
    },
  )

  if (!response.ok) {
    throw new Error(
      `ClickHouse top-followed request failed with status ${response.status}`,
    )
  }

  const payload = (await response.json()) as TopFollowedAccountsResponse
  if (!Array.isArray(payload.data)) {
    throw new Error('ClickHouse top-followed response did not contain data')
  }

  return payload.data.flatMap((value): AvatarType[] => {
    const account = value as TopFollowedAccount
    const hasFollowerCount =
      typeof account.followerCount === 'string' ||
      typeof account.followerCount === 'number'
    const followerCount = Number(account.followerCount)

    if (
      typeof account.accountId !== 'string' ||
      !ACCOUNT_ID_PATTERN.test(account.accountId) ||
      typeof account.username !== 'string' ||
      account.username.length === 0 ||
      !hasFollowerCount ||
      !Number.isFinite(followerCount) ||
      followerCount < 0
    ) {
      return []
    }

    return [
      {
        account_id: account.accountId,
        username: account.username,
        avatar_media_url:
          typeof account.avatarUrl === 'string' ? account.avatarUrl : '',
        num_followers: followerCount,
      },
    ]
  })
}
