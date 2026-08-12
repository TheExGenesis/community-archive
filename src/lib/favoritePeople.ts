import 'server-only'
import { fetchAnalyticsGatewayJson } from '@/lib/clickhouseGateway'

const DEFAULT_LIMIT = 8
const MAX_LIMIT = 12
const ACCOUNT_ID_PATTERN = /^\d{1,20}$/

interface ClickHouseInteractedAccount {
  accountId: unknown
  username: unknown
  displayName: unknown
  avatarUrl: unknown
  interactionCount: unknown
  mentionCount: unknown
  replyCount: unknown
  quoteCount: unknown
  repostCount: unknown
}

interface ClickHouseUserResponse {
  data?: {
    topInteractedAccounts?: unknown
  }
}

export interface FavoritePerson {
  accountId: string
  username: string | null
  displayName: string | null
  avatarUrl: string | null
  interactionCount: number
  mentionCount: number
  replyCount: number
  quoteCount: number
  repostCount: number
}

export interface FavoritePeopleData {
  people: FavoritePerson[]
  unavailable: boolean
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function count(value: unknown): number {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0
}

function favoritePerson(value: unknown): FavoritePerson {
  const account = value as ClickHouseInteractedAccount
  if (
    typeof account?.accountId !== 'string' ||
    !ACCOUNT_ID_PATTERN.test(account.accountId)
  ) {
    throw new Error('ClickHouse user analytics returned an invalid account')
  }

  return {
    accountId: account.accountId,
    username: optionalText(account.username),
    displayName: optionalText(account.displayName),
    avatarUrl: optionalText(account.avatarUrl),
    interactionCount: count(account.interactionCount),
    mentionCount: count(account.mentionCount),
    replyCount: count(account.replyCount),
    quoteCount: count(account.quoteCount),
    repostCount: count(account.repostCount),
  }
}

export async function fetchFavoritePeople(
  identifier: string,
  requestedLimit = DEFAULT_LIMIT,
  fetcher = fetchAnalyticsGatewayJson,
): Promise<FavoritePerson[]> {
  const cleanIdentifier = identifier.trim().replace(/^@/, '')
  if (!/^(?:\d{1,20}|[A-Za-z0-9_]{1,80})$/.test(cleanIdentifier)) return []

  const finiteLimit = Number.isFinite(requestedLimit)
    ? requestedLimit
    : DEFAULT_LIMIT
  const limit = Math.max(
    1,
    Math.min(MAX_LIMIT, Math.trunc(finiteLimit || DEFAULT_LIMIT)),
  )
  const response = await fetcher<ClickHouseUserResponse>(
    ['user', cleanIdentifier],
    new URLSearchParams({ limit: String(limit) }),
    { revalidate: 300, timeoutMs: 8_000 },
  )
  const accounts = response.data?.topInteractedAccounts
  if (!Array.isArray(accounts)) {
    throw new Error('ClickHouse user analytics returned an invalid response')
  }

  return accounts
    .map(favoritePerson)
    .filter((person) => person.interactionCount)
}

export async function loadFavoritePeople(
  identifier: string,
): Promise<FavoritePeopleData> {
  try {
    return {
      people: await fetchFavoritePeople(identifier),
      unavailable: false,
    }
  } catch (error) {
    console.error('Failed to load favorite people from ClickHouse:', error)
    return { people: [], unavailable: true }
  }
}
