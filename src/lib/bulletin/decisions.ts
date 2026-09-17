import 'server-only'
import { createHash } from 'crypto'
import { getAdminClient } from '@/app/admin/data'
import { createServerServiceRoleClient } from '@/utils/supabase'
import { getLocalAdminPreview } from '@/lib/localAdminPreview'
import { fetchAnalyticsGatewayJson } from '@/lib/clickhouseGateway'
import { hydrateBulletinTweets } from './tweets'

export const DECISION_PAGE_SIZE = 25
export const DECISION_LABELS = {
  all: 'All candidates',
  positive: 'Accepted',
  negative: 'Rejected',
  pending: 'Waiting',
  failed: 'Failed / retrying',
} as const
export type DecisionStatus = keyof typeof DECISION_LABELS
export type StoredDecision = {
  tweet_id: string
  account_id: string
  posted_at: string
  content_hash: string
  status: Exclude<DecisionStatus, 'all'>
  attempts: number
  updated_at: string
  last_attempt_at: string | null
  version: string
  username: string
  summary: string | null
  evidence: string | null
  side: string | null
  kind: string | null
}
export type Decision = Omit<StoredDecision, 'content_hash'> & { text: string }

export function decisionStatus(value = 'all'): DecisionStatus {
  if (!Object.hasOwn(DECISION_LABELS, value))
    throw new Error('Invalid decision filter')
  return value as DecisionStatus
}
function cursor(value?: string) {
  if (!value) return {}
  const [updated, id, extra] = value.split('|')
  if (
    extra !== undefined ||
    !/^\d{1,20}$/.test(id || '') ||
    !/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(updated) ||
    !Number.isFinite(Date.parse(updated))
  )
    throw new Error('Invalid decision cursor')
  return { before_updated_at: updated, before_tweet_id: id }
}
async function records(status: DecisionStatus, before?: string, id?: string) {
  const admin =
    (await getLocalAdminPreview()) === 'admin'
      ? createServerServiceRoleClient()
      : await getAdminClient()
  const { data, error } = await admin.rpc('get_bulletin_decisions', {
    decision_status: status === 'all' ? undefined : status,
    ...cursor(before),
    max_results: DECISION_PAGE_SIZE + 1,
    selected_tweet_id: id,
  })
  if (error || !Array.isArray(data))
    throw new Error('Decisions could not be loaded')
  return data as unknown as StoredDecision[]
}
export async function loadDecisions(
  status: DecisionStatus = 'all',
  before?: string,
) {
  const rows = await records(decisionStatus(status), before)
  const page = rows.slice(0, DECISION_PAGE_SIZE)
  const decisions: Decision[] = []
  if (page.length) {
    const response = await fetchAnalyticsGatewayJson<{
      data: {
        tweet_id: string
        account_id: string
        full_text: string
        reply_to_tweet_id: string | null
        retweet: boolean
      }[]
    }>(
      ['bulletin-sources'],
      new URLSearchParams({ ids: page.map((r) => r.tweet_id).join(',') }),
    )
    const sources = new Map(response.data.map((row) => [row.tweet_id, row]))
    for (const row of page) {
      const source = sources.get(row.tweet_id)
      if (
        !source ||
        source.account_id !== row.account_id ||
        source.reply_to_tweet_id ||
        source.retweet ||
        source.full_text.startsWith('RT @') ||
        createHash('sha256').update(source.full_text).digest('hex') !==
          row.content_hash
      )
        continue
      const { content_hash: _hash, ...decision } = row
      decisions.push({ ...decision, text: source.full_text })
    }
  }
  const last = page[page.length - 1]
  return {
    decisions,
    hidden: page.length - decisions.length,
    next:
      rows.length > DECISION_PAGE_SIZE
        ? `${last.updated_at}|${last.tweet_id}`
        : null,
  }
}
export async function loadDecisionTweet(id: string) {
  if (!/^\d{1,20}$/.test(id)) throw new Error('Invalid tweet ID')
  const rows = await records('all', undefined, id)
  if (!rows.some((row) => row.tweet_id === id)) return null
  const { tweets } = await hydrateBulletinTweets([id], { notices: rows })
  return tweets[0] || null
}
