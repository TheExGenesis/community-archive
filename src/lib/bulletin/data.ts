import { getSessionTwitterUsername } from '@/lib/sessionTwitterUsername'
import 'server-only'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/portal/auth'
import { getLocalAdminPreview } from '@/lib/localAdminPreview'
import { getAdminClient, requireAdmin, checkIsAdmin } from '@/app/admin/data'
import { createServerServiceRoleClient } from '@/utils/supabase'
import { fetchAnalyticsGatewayJson } from '@/lib/clickhouseGateway'
import { createHash } from 'crypto'
import type { Notice, RunDashboard } from './types'

export const BULLETIN_LIMIT = 2000
export const RUN_PAGE_SIZE = 25

export async function requireBulletinUser() {
  if ((await getLocalAdminPreview()) === 'admin') return null
  // Member-preview cookies never authorize reads. The explicit loopback-only
  // local admin read preview follows the same convention as Birdseye.
  const user = await getCurrentUser()
  if (!user || user.is_anonymous) redirect('/login?redirect=/bulletin')
  return user
}

/** Hydrate only the selected notices, retaining the live source/policy checks. */
export async function hydrateBulletinNotices({
  notices,
  allowedAccounts,
}: {
  notices: StoredNotice[]
  allowedAccounts?: string[]
}): Promise<Notice[]> {
  const result: Notice[] = []
  for (let offset = 0; offset < notices.length; offset += 100) {
    const batch = notices.slice(offset, offset + 100)
    const response = await fetchAnalyticsGatewayJson<{
      data: Array<{
        tweet_id: string
        account_id: string
        full_text: string
        reply_to_tweet_id: string | null
        retweet: boolean
        created_at: string
        username: string
        display_name: string
        account_created_at: string | null
        avatar_url: string | null
        replies: number
        quotes: number
        reply_account_ids: string[]
        renewed_at: string | null
      }>
    }>(
      ['bulletin-sources'],
      new URLSearchParams({
        ids: batch.map((o) => o.tweet_id).join(','),
        enrich: 'true',
      }),
      { timeoutMs: 60000 },
    )
    const sources = new Map(response.data.map((row) => [row.tweet_id, row]))
    for (const notice of batch) {
      const source = sources.get(notice.tweet_id)
      if (
        !source ||
        (notice.account_id
          ? source.account_id !== notice.account_id
          : !allowedAccounts?.includes(source.account_id)) ||
        source.reply_to_tweet_id ||
        source.retweet ||
        source.full_text.startsWith('RT @') ||
        createHash('sha256').update(source.full_text).digest('hex') !==
          notice.content_hash
      )
        continue
      result.push({
        tweet_id: notice.tweet_id,
        account_id: source.account_id,
        username: source.username,
        posted_at: utc(source.created_at),
        preview_text: source.full_text,
        side: notice.side,
        kind: notice.kind,
        summary: notice.summary,
        evidence: notice.evidence,
        topics: notice.topics,
        respond: notice.respond,
        standing: notice.standing,
        expires_at: notice.expires_at,
        place: notice.place,
        display_name: source.display_name,
        account_created_at: source.account_created_at,
        avatar_url: source.avatar_url,
        replies: source.replies,
        quotes: source.quotes,
        reply_account_ids: source.reply_account_ids,
        renewed_at: source.renewed_at ? utc(source.renewed_at) : null,
      })
    }
  }
  return result
}
function utc(value: string) {
  return /Z$|[+-]\d\d:\d\d$/.test(value) ? value : value.replace(' ', 'T') + 'Z'
}

export async function isBulletinAdmin() {
  return (await getLocalAdminPreview()) === 'admin' || (await checkIsAdmin())
}
export async function requireBulletinAdmin() {
  if ((await getLocalAdminPreview()) !== 'admin')
    await requireAdmin('/admin/bulletin')
}
export async function loadRunDashboard(before?: string): Promise<RunDashboard> {
  const localPreview = (await getLocalAdminPreview()) === 'admin'
  if (localPreview && process.env.BULLETIN_LOCAL_RUN_PREVIEW_URL) {
    const url = new URL(process.env.BULLETIN_LOCAL_RUN_PREVIEW_URL)
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1')
      throw new Error('Invalid local preview URL')
    const response = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) throw new Error('Local run snapshot unavailable')
    return response.json() as Promise<RunDashboard>
  }
  const admin = localPreview
    ? createServerServiceRoleClient()
    : await getAdminClient()
  const beforeId = before === undefined ? undefined : Number(before)
  if (
    before !== undefined &&
    (!/^\d+$/.test(before) || !Number.isSafeInteger(beforeId) || beforeId! < 1)
  )
    throw new Error('Invalid run cursor')
  const { data, error } = await admin.rpc('get_bulletin_runs', {
    before_id: beforeId,
    max_results: RUN_PAGE_SIZE + 1,
  })
  if (error || !data) throw new Error('Run history could not be loaded')
  return data as unknown as RunDashboard
}

export async function loadBulletinRelationships() {
  const user = await requireBulletinUser()
  // The loopback admin preview has no session. Let a local fixture name the
  // viewer so badges and Recommended can be exercised; never trusted elsewhere.
  const preview = !user && (await getLocalAdminPreview()) === 'admin'
  const providerId = preview
    ? process.env.BULLETIN_LOCAL_PREVIEW_ACCOUNT_ID
    : user?.app_metadata?.provider_id
  const me =
    typeof providerId === 'string' && /^\d{1,20}$/.test(providerId)
      ? providerId
      : ''
  const previewUsername = process.env.BULLETIN_LOCAL_PREVIEW_USERNAME || ''
  const username = user
    ? getSessionTwitterUsername(user) || ''
    : preview && /^[A-Za-z0-9_]{1,15}$/.test(previewUsername)
      ? previewUsername
      : ''
  const follows = await loadFollowLists(me, username, preview)
  const empty = {
    account_id: me,
    username,
    outgoing: {} as Record<string, number>,
    available: false,
    ...follows,
  }
  const identifier = me || username
  if (!identifier) return empty
  try {
    const response = await fetchAnalyticsGatewayJson<{
      data: {
        people: Array<{ accountId: string; interactionCount: string | number }>
      }
      query: { accountId: string; year: number | null; peopleLimit: number }
    }>(
      ['user', identifier, 'interactions'],
      new URLSearchParams({ limit: '25' }),
      { timeoutMs: 30_000 },
    )
    if (
      !/^\d{1,20}$/.test(response.query?.accountId) ||
      (!!me && response.query.accountId !== me) ||
      response.query.year !== null ||
      response.query.peopleLimit !== 25 ||
      !Array.isArray(response.data?.people)
    )
      return empty
    const outgoing: Record<string, number> = {}
    for (const person of response.data.people) {
      const count = Number(person.interactionCount)
      if (
        /^\d{1,20}$/.test(person.accountId) &&
        Number.isSafeInteger(count) &&
        count > 0
      )
        outgoing[person.accountId] = count
    }
    return {
      ...empty,
      account_id: response.query.accountId,
      outgoing,
      available: true,
    }
  } catch {
    return empty
  }
}

const ID = /^\d{1,20}$/
function idList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string' && ID.test(v))
    : []
}
/** Follow lists from members' own archive uploads: a snapshot, not live X. */
async function loadFollowLists(me: string, username: string, preview: boolean) {
  const none = { following: [] as string[], followers: [] as string[] }
  if (!me && !username) return none
  try {
    if (preview && process.env.BULLETIN_LOCAL_RELATIONSHIPS_URL) {
      const url = new URL(process.env.BULLETIN_LOCAL_RELATIONSHIPS_URL)
      if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') return none
      const response = await fetch(url, {
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      })
      if (!response.ok) return none
      const data = await response.json()
      return {
        following: idList(data?.following),
        followers: idList(data?.followers),
      }
    }
    const { data, error } = await createServerServiceRoleClient().rpc(
      'get_bulletin_relationships',
      me ? { viewer_account_id: me } : { viewer_username: username },
    )
    if (error || !data || typeof data !== 'object') return none
    const graph = data as { following?: unknown; followers?: unknown }
    return {
      following: idList(graph.following),
      followers: idList(graph.followers),
    }
  } catch {
    return none
  }
}

export type StoredNotice = Notice & { content_hash: string }
export async function loadBulletinBoardState(): Promise<{
  notices: StoredNotice[]
  allowedAccounts?: string[]
}> {
  await requireBulletinUser()
  if (
    (await getLocalAdminPreview()) === 'admin' &&
    process.env.BULLETIN_LOCAL_BOARD_PREVIEW_URL
  ) {
    const url = new URL(process.env.BULLETIN_LOCAL_BOARD_PREVIEW_URL)
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1')
      throw new Error('Invalid local board preview URL')
    const response = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    })
    if (!response.ok) throw new Error('Local board snapshot unavailable')
    return response.json()
  }
  const { data, error } = await createServerServiceRoleClient().rpc(
    'get_bulletin_board_state',
    { max_results: BULLETIN_LIMIT },
  )
  if (error) throw new Error('Bulletin notices could not be loaded')
  return { notices: (data ?? []) as unknown as StoredNotice[] }
}
