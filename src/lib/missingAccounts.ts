import { fetchAnalyticsGatewayJson } from '@/lib/clickhouseGateway'

export type MissingAccount = {
  rank: number
  accountId: string
  username: string | null
  displayName: string | null
  avatarUrl: string | null
  referenceCount: string
  mentionCount: string
  replyCount: string
}

export type MissingAccountsResponse = {
  data: {
    needsOptIn: MissingAccount[]
    needsArchive: MissingAccount[]
  }
  query: {
    limit: number
    countMode: 'unique_reply_tweets'
    includesMentions: boolean
    includesReplies: boolean
  }
  generatedAt: string
  timing: {
    wallMs: number
    clickhouseMs: number
    rowsRead: number
    bytesRead: number
    roundTrips?: number
  }
}

export async function getMissingAccounts(): Promise<MissingAccountsResponse> {
  return fetchAnalyticsGatewayJson<MissingAccountsResponse>(
    ['missing-accounts'],
    new URLSearchParams({ limit: '100' }),
    { timeoutMs: 30_000, revalidate: 60 },
  )
}
