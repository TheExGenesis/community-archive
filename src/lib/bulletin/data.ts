import { getSessionTwitterUsername } from '@/lib/sessionTwitterUsername'
import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/portal/auth'
import { getOptInStatus } from '@/lib/auth-utils'
import { getLocalAdminPreview } from '@/lib/localAdminPreview'
import { getAdminClient, requireAdmin, checkIsAdmin } from '@/app/admin/data'
import { createServerServiceRoleClient } from '@/utils/supabase'
import { fetchAnalyticsGatewayJson } from '@/lib/clickhouseGateway'
import { createHash } from 'crypto'
import { measureServerRead } from '@/lib/performance/server'
import { after } from 'next/server'
import { createSharedCache } from './sharedCache'
import type { Notice, RunDashboard } from './types'

export const BULLETIN_LIMIT = 2000
export const RUN_PAGE_SIZE = 25

async function readBulletinUser() {
  if ((await getLocalAdminPreview()) === 'admin') return null
  // Member-preview cookies never authorize reads. The explicit loopback-only
  // local admin read preview follows the same convention as Birdseye.
  const user = await getCurrentUser()
  if (!user || user.is_anonymous) redirect('/login?redirect=/bulletin')
  // Read current consent from PostgreSQL, never session metadata or archive
  // membership. An explicit opt-out overrides even a stale positive flag.
  const { data: consent, error } = await getOptInStatus(user.id)
  if (error && error.code !== 'PGRST116')
    throw new Error('Bulletin opt-in status could not be checked. Try again.')
  if (error || consent?.opted_in !== true || consent.explicit_optout === true)
    redirect('/opt-in?redirect=/bulletin')
  return user
}

// Share one live consent check within this server render, never across requests.
// React 18's non-RSC test runtime does not provide cache().
const requestCache = cache ?? ((read: typeof readBulletinUser) => read)
export const requireBulletinUser = requestCache(() =>
  measureServerRead('bulletin.access', readBulletinUser),
)

/** Hydrate only the selected notices, retaining the live source/policy checks. */
export async function hydrateBulletinNotices({
  notices,
  allowedAccounts,
}: {
  notices: StoredNotice[]
  allowedAccounts?: string[]
}): Promise<Notice[]> {
  const batches: StoredNotice[][] = []
  for (let offset = 0; offset < notices.length; offset += 100)
    batches.push(notices.slice(offset, offset + 100))
  const results: Notice[][] = new Array(batches.length)
  let next = 0
  // A few batches at a time: a whole board is ~20 batches, and one at a time
  // took most of a page view. Output keeps the input order.
  async function worker() {
    while (next < batches.length) {
      const index = next++
      results[index] = await hydrateBatch(batches[index], allowedAccounts)
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(HYDRATE_CONCURRENCY, batches.length) },
      worker,
    ),
  )
  return results.flat()
}
const HYDRATE_CONCURRENCY = 4

async function hydrateBatch(
  batch: StoredNotice[],
  allowedAccounts?: string[],
): Promise<Notice[]> {
  const result: Notice[] = []
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
      resolution_state: notice.resolution_state,
      resolution_tweet_id: notice.resolution_tweet_id,
      p_opportunity: notice.p_opportunity,
      p_direct: notice.p_direct,
      p_joke: notice.p_joke,
      value_score: notice.value_score,
    })
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

async function bulletinViewer() {
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
  return { me, username, preview }
}

/** Notices this reader hid as not relevant. The local admin preview has none. */
export async function loadBulletinDismissals(): Promise<string[]> {
  const user = await requireBulletinUser()
  if (!user) return []
  return loadBulletinDismissalsForUser(user.id)
}
/** Server-only: the caller has already established who `userId` is. */
export async function loadBulletinDismissalsForUser(
  userId: string,
): Promise<string[]> {
  const { data, error } = await createServerServiceRoleClient().rpc(
    'get_bulletin_dismissals',
    { viewer_id: userId },
  )
  if (error) throw new Error('Bulletin dismissals could not be loaded')
  return data ?? []
}
/** Hide one notice, or restore one (or, with no id, all). False without a session. */
export async function setBulletinDismissal(
  tweetId: string | null,
  dismissed: boolean,
) {
  const user = await requireBulletinUser()
  if (!user) return false
  const { me } = await bulletinViewer()
  const { error } = await createServerServiceRoleClient().rpc(
    'set_bulletin_dismissal',
    {
      viewer_id: user.id,
      viewer_account_id: me,
      // SQL NULL restores every notice; generated types omit nullability.
      notice_tweet_id: tweetId as string,
      dismissed,
    },
  )
  if (error) throw new Error('Bulletin dismissal could not be saved')
  return true
}

/** Trusted identity only: no network lookup for recommendations. */
export async function loadBulletinViewer() {
  const { me, username } = await bulletinViewer()
  const empty = {
    account_id: me,
    username,
    outgoing: {} as Record<string, number>,
    available: false,
  }
  return empty
}

/** Recommendations use ClickHouse outgoing interactions, never follow lists. */
// Who a reader interacts with changes slowly; reuse a successful lookup on
// this instance instead of repeating it on every Bulletin and homepage view.
const RELATIONSHIPS_TTL_MS = 15 * 60_000
const RELATIONSHIPS_MAX_ENTRIES = 1000
const relationshipCache = new Map<
  string,
  { at: number; value: Awaited<ReturnType<typeof readOutgoingInteractions>> }
>()

async function outgoingInteractions(
  identifier: string,
  expectedAccountId: string,
) {
  const key = `${identifier}:${expectedAccountId}`
  const hit = relationshipCache.get(key)
  if (hit && Date.now() - hit.at < RELATIONSHIPS_TTL_MS) return hit.value
  const value = await readOutgoingInteractions(identifier, expectedAccountId)
  if (value.available) {
    relationshipCache.delete(key)
    relationshipCache.set(key, { at: Date.now(), value })
    if (relationshipCache.size > RELATIONSHIPS_MAX_ENTRIES)
      relationshipCache.delete(relationshipCache.keys().next().value!)
  }
  return value
}

async function readOutgoingInteractions(
  identifier: string,
  expectedAccountId: string,
) {
  const empty = {
    account_id: expectedAccountId,
    outgoing: {} as Record<string, number>,
    available: false,
  }
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
      (!!expectedAccountId && response.query.accountId !== expectedAccountId) ||
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

export async function loadBulletinRelationships() {
  const viewer = await loadBulletinViewer()
  const relationships = await outgoingInteractions(
    viewer.account_id || viewer.username,
    viewer.account_id,
  )
  return { ...viewer, ...relationships }
}

/** Server-only digest lookup using the account id saved at authenticated signup. */
export function loadBulletinRelationshipsForAccount(accountId: string) {
  return outgoingInteractions(
    /^\d{1,20}$/.test(accountId) ? accountId : '',
    accountId,
  )
}

export type StoredNotice = Notice & { content_hash: string }
/** Production-only source for an explicitly authorized, read-only PR preview. */
export async function loadBulletinBoardSnapshot(): Promise<StoredNotice[]> {
  const { data, error } = await createServerServiceRoleClient().rpc(
    'get_bulletin_board_state',
    { max_results: BULLETIN_LIMIT },
  )
  if (error) throw new Error('Bulletin notices could not be loaded')
  return (data ?? []) as unknown as StoredNotice[]
}

export async function loadBulletinBoardState(verifyResolution = true): Promise<{
  notices: StoredNotice[]
  allowedAccounts?: string[]
}> {
  await requireBulletinUser()
  const local = await readLocalBoardPreview()
  if (local) return local
  const notices = await readBulletinBoardSource()
  if (verifyResolution) await verifyBulletinResolutions(notices)
  return { notices }
}

async function readLocalBoardPreview(): Promise<{
  notices: StoredNotice[]
  allowedAccounts?: string[]
} | null> {
  if (
    !process.env.BULLETIN_LOCAL_BOARD_PREVIEW_URL ||
    (await getLocalAdminPreview()) !== 'admin'
  )
    return null
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

/** The stored notices for this deployment, without any viewer check. */
async function readBulletinBoardSource(): Promise<StoredNotice[]> {
  const previewUrl = process.env.BULLETIN_PRODUCTION_BOARD_URL
  let notices: StoredNotice[]
  if (process.env.VERCEL_ENV === 'preview' && previewUrl) {
    const url = new URL(previewUrl)
    if (
      url.origin !== 'https://www.community-archive.org' ||
      url.pathname !== '/api/bulletin/preview-board' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error('Invalid production Bulletin source URL')
    const secret = process.env.BULLETIN_PREVIEW_READ_SECRET
    if (!secret || secret.length < 32)
      throw new Error('Production Bulletin preview is not configured')
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok)
      throw new Error('Production Bulletin preview is unavailable')
    const body: unknown = await response.json()
    if (!Array.isArray(body))
      throw new Error('Invalid production Bulletin snapshot')
    notices = body as StoredNotice[]
  } else {
    notices = await loadBulletinBoardSnapshot()
  }
  return notices
}

export type VerifiedBulletinBoard = {
  /** Stored notices with resolution evidence already checked. */
  notices: StoredNotice[]
  /** Source-checked cards by tweet ID; a notice missing here failed its check. */
  sources: Map<string, Notice>
  allowedAccounts?: string[]
}

async function verifyBoard(
  notices: StoredNotice[],
  allowedAccounts?: string[],
): Promise<VerifiedBulletinBoard> {
  const [, rows] = await Promise.all([
    verifyBulletinResolutions(notices),
    hydrateBulletinNotices({ notices, allowedAccounts }),
  ])
  // Resolution checks may finish after hydration; use their final state.
  const byId = new Map(notices.map((o) => [o.tweet_id, o]))
  const sources = new Map<string, Notice>()
  for (const row of rows) {
    const stored = byId.get(row.tweet_id)
    sources.set(row.tweet_id, {
      ...row,
      resolution_state: stored?.resolution_state,
      resolution_tweet_id: stored?.resolution_tweet_id,
    })
  }
  return { notices, sources, allowedAccounts }
}

/**
 * Every reader sees the same notices and the same source checks, so one
 * instance rebuilds them in the background instead of once per page view.
 * Rechecking ~2,000 sources took 5–12 s per view. A card can therefore lag a
 * deletion, edit or opt-out by at most BOARD_MAX_STALE_MS; the stored board
 * itself already applies membership and opt-out policy.
 */
export const BOARD_FRESH_MS = 2 * 60_000
export const BOARD_MAX_STALE_MS = 10 * 60_000
const sharedBoard = createSharedCache(
  async () => verifyBoard(await readBulletinBoardSource()),
  {
    freshMs: BOARD_FRESH_MS,
    maxStaleMs: BOARD_MAX_STALE_MS,
    background(work) {
      const quiet = work.catch(() => {})
      try {
        after(() => quiet)
      } catch {
        // Outside a request (tests, static generation) the promise just runs.
      }
    },
  },
)

/** Tests only: forget instance-level caches between cases. */
export function clearBulletinCaches() {
  sharedBoard.clear()
  relationshipCache.clear()
}

/** The verified board for a signed-in, opted-in reader. */
export async function loadVerifiedBulletinBoard(): Promise<VerifiedBulletinBoard> {
  await requireBulletinUser()
  const local = await readLocalBoardPreview()
  if (local) return verifyBoard(local.notices, local.allowedAccounts)
  return sharedBoard.get()
}

/**
 * The same verified board without a viewer check, for surfaces that show
 * public picks to everyone, as the published digest already does. Preview
 * deployments read the production board but stay behind Vercel protection.
 */
export function loadPublicBulletinBoard(): Promise<VerifiedBulletinBoard> {
  return sharedBoard.get()
}

/** Callers deferring this check must await it before selecting visible cards. */
export async function verifyBulletinResolutions(notices: StoredNotice[]) {
  // Verify resolution evidence even for notices hidden by the default filter.
  // A deleted/edited update must not leave a notice silently hidden forever.
  const resolved = notices.filter((o) => o.resolution_state === 'resolved')
  for (let offset = 0; offset < resolved.length; offset += 100) {
    const batch = resolved.slice(offset, offset + 100)
    const ids = Array.from(
      new Set(
        batch
          .map((o) => o.resolution_tweet_id)
          .filter((id): id is string => !!id && /^\d{1,20}$/.test(id)),
      ),
    )
    const sources = ids.length
      ? (
          await fetchAnalyticsGatewayJson<{
            data: Array<{
              tweet_id: string
              account_id: string
              full_text: string
            }>
          }>(['bulletin-sources'], new URLSearchParams({ ids: ids.join(',') }))
        ).data
      : []
    const byId = new Map(sources.map((o) => [o.tweet_id, o]))
    for (const notice of batch) {
      const evidence = byId.get(notice.resolution_tweet_id || '')
      if (
        !evidence ||
        evidence.account_id !== notice.account_id ||
        createHash('sha256').update(evidence.full_text).digest('hex') !==
          notice.resolution_content_hash
      ) {
        notice.resolution_state = 'unknown'
        notice.resolution_tweet_id = null
      }
    }
  }
}
