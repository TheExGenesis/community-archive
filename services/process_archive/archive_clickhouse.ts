import { getArchiveTweetMedia } from './archive_media'

const UINT64_PATTERN = /^(0|[1-9][0-9]*)$/
const MAX_UINT64 = (1n << 64n) - 1n
const TWITTER_USERNAME_PATTERN = /^[A-Za-z0-9_]{1,15}$/
const EPOCH = '1970-01-01T00:00:00.000Z'

export const ARCHIVE_CLICKHOUSE_SOURCE = 'archive_upload'
export const ARCHIVE_CLICKHOUSE_TOMBSTONE_SOURCE =
  'archive_upload_policy_tombstone'
export const ARCHIVE_CLICKHOUSE_GRAPH_PURGE_SOURCE =
  'archive_graph_policy_purge'
export const ARCHIVE_CLICKHOUSE_GRAPH_TABLES = [
  'account_likes',
  'liked_tweet_versions',
  'account_follows',
] as const
const GRAPH_INSERT_CHUNK_ROWS = 25_000
const GRAPH_PURGE_TIMEOUT_MS = 10 * 60_000

export interface ArchiveClickHouseManifest {
  archiveUploadId: string
  accountId: string
  tweetIds: string[]
}

export interface ArchiveClickHouseDelivery {
  archive_upload_id: string | number
  account_id: string
  tweet_ids: string[]
  username?: string | null
  storage_path?: string | null
  storage_sha256?: string | null
}

export interface ArchivePolicyCandidate {
  key: string
  accountId: string | null
  username: string | null
  tweetId: string | null
}

export interface ArchivePolicyDecision {
  accountId: string | null
  blocked: boolean
}

export type ArchivePolicyDecisions = Map<string, ArchivePolicyDecision>

export interface ArchiveClickHouseBatch {
  account_observations: Record<string, unknown>[]
  tweet_content_versions: Record<string, unknown>[]
  tweet_engagement_observations: Record<string, unknown>[]
  tweet_analytics_versions: Record<string, unknown>[]
  tweet_archive_provenance: Record<string, unknown>[]
  tweet_mentions: Record<string, unknown>[]
  tweet_relationships: Record<string, unknown>[]
  tweet_media_versions: Record<string, unknown>[]
  tweet_url_versions: Record<string, unknown>[]
}

// Likes and follow edges are written beside, not inside, the tweet batch: the
// canonical queue publisher maps every ArchiveClickHouseBatch table to a
// queue entity and has no likes/follows entity types.
export interface ArchiveClickHouseGraphBatch {
  account_likes: Record<string, unknown>[]
  liked_tweet_versions: Record<string, unknown>[]
  account_follows: Record<string, unknown>[]
}

export interface LockedArchiveDeliveryContext {
  ownerBlocked: boolean
  /**
   * True only when likes/follows delivery is enabled and, under the owner's
   * policy lock, the upload is still a completed upload of this account. A
   * deleted upload must not be re-written by a delayed retry.
   */
  graphEligible?: boolean
  resolvePolicies(
    candidates: ArchivePolicyCandidate[],
  ): Promise<ArchivePolicyDecisions>
  markDelivered(): Promise<void>
}

export interface ArchiveDeliveryAttemptOptions {
  delivery: ArchiveClickHouseDelivery
  archive?: any
  loadArchive?: (username: string) => Promise<any>
  withOwnerPolicyLock(
    accountId: string,
    operation: (context: LockedArchiveDeliveryContext) => Promise<void>,
  ): Promise<void>
  sink: Pick<ArchiveClickHouseSink, 'writeBatch'> &
    Partial<Pick<ArchiveClickHouseSink, 'writeGraphBatch'>>
  markPending(errorCode: string): Promise<void>
  now?: () => Date
}

export type ArchiveGraphPurgeReason =
  | 'delete_user_archive'
  | 'delete_single_archive'
  | 'policy_tombstone'

/** A row of private.archive_clickhouse_graph_purge. */
export interface ArchiveGraphPurgeRequest {
  id: string | number
  purge_scope: 'account' | 'archive_upload'
  account_id: string
  archive_upload_id: string | number | null
  reason: ArchiveGraphPurgeReason
}

/** What one purge removes from ClickHouse, resolved from current state. */
export interface ArchiveGraphPurgePlan {
  accountId: string
  /** Remove only this upload's rows (delete_single_archive). */
  archiveUploadId: string | null
  /** Account scope: keep rows from these still-existing uploads. */
  keepUploadIds: string[]
  /**
   * Account scope: never touch uploads created after the state was read.
   * This is the upload ID sequence's high-water mark (never MAX(id), which
   * drops when the purged deletion removed the newest uploads), so a
   * re-upload delivered while the ClickHouse mutation runs stays intact.
   */
  maxUploadId: string
  /** Opt-out: also tombstone liked-tweet text authored by the account. */
  purgeLikedTweetAuthor: boolean
  requestId: string
}

/**
 * PostgreSQL state for one purge, read in a short transaction holding the
 * account policy lock and released before any ClickHouse work: holding the
 * lock across a mutation would make that account's opt-out wait and fail
 * under the API's lock_timeout. Taking the lock still orders the read after
 * any delivery that is writing this account's rows.
 */
export interface ArchiveGraphPurgeState {
  /** False when an earlier duplicate already completed this request. */
  requestPending: boolean
  existingUploadIds: string[]
  ownerBlocked: boolean
  maxUploadId: string
  /**
   * Other pending requests with the same scope, account, upload and reason,
   * read before the upload state, so this run covers every deletion they
   * stand for. Completing them with this one bounds the queue.
   */
  coveredRequestIds: string[]
}

export interface ArchiveGraphPurgeAttemptOptions {
  request: ArchiveGraphPurgeRequest
  readStateUnderPolicyLock(accountId: string): Promise<ArchiveGraphPurgeState>
  sink: Pick<ArchiveClickHouseSink, 'purgeGraph'>
  markCompleted(requestIds: string[]): Promise<void>
  markPending(errorCode: string): Promise<void>
}

export type ArchiveDeliveryAttemptResult =
  | { status: 'delivered' }
  | { status: 'pending'; errorCode: string }

export type ArchiveGraphPurgeAttemptResult =
  | { status: 'completed' }
  | { status: 'pending'; errorCode: string }

export class ArchiveClickHouseError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'ArchiveClickHouseError'
  }
}

function asUInt64(value: unknown): string | null {
  if (
    typeof value !== 'string' &&
    typeof value !== 'number' &&
    typeof value !== 'bigint'
  ) {
    return null
  }
  const normalized = String(value).trim()
  if (!UINT64_PATTERN.test(normalized)) return null
  try {
    if (BigInt(normalized) > MAX_UINT64) return null
  } catch {
    return null
  }
  return normalized
}

function asUsername(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return TWITTER_USERNAME_PATTERN.test(normalized) ? normalized : null
}

function cleanText(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
}

function nonnegativeInteger(value: unknown): number {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) return 0
  return Math.trunc(number)
}

function nullableDate(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function eventPrefix(manifest: ArchiveClickHouseManifest): string {
  return `archive:${manifest.archiveUploadId}`
}

function candidateKey(
  accountId: string | null,
  username: string | null,
  tweetId: string | null,
): string {
  return `${accountId ?? ''}|${username?.toLowerCase() ?? ''}|${tweetId ?? ''}`
}

function quoteTarget(
  url: unknown,
): { tweetId: string; username: string | null } | null {
  if (typeof url !== 'string') return null
  const match = url.match(
    /(?:twitter\.com|x\.com)\/([A-Za-z0-9_]{1,15})\/status\/(\d+)/i,
  )
  const tweetId = asUInt64(match?.[2])
  if (!tweetId) return null
  return { tweetId, username: asUsername(match?.[1]) }
}

function retweetTarget(
  tweet: any,
): { tweetId: string; username: string | null } | null {
  const tweetId = asUInt64(
    tweet?.retweeted_status_id_str ??
      tweet?.retweeted_status_id ??
      tweet?.retweeted_status?.id_str,
  )
  if (!tweetId) return null
  const username = asUsername(
    typeof tweet?.full_text === 'string'
      ? tweet.full_text.match(/^RT @([A-Za-z0-9_]{1,15}):/)?.[1]
      : null,
  )
  return { tweetId, username }
}

export function createArchiveClickHouseManifest(
  archive: any,
  archiveUploadId: string | number,
): ArchiveClickHouseManifest {
  const accountId = asUInt64(archive?.account?.[0]?.account?.accountId)
  const normalizedUploadId = asUInt64(archiveUploadId)
  if (!accountId || !normalizedUploadId) {
    throw new ArchiveClickHouseError('invalid_archive_identity')
  }

  const tweetIds = new Set<string>()
  for (const record of archive?.tweets ?? []) {
    const tweetId = asUInt64(record?.tweet?.id_str ?? record?.tweet?.id)
    if (tweetId) tweetIds.add(tweetId)
  }

  return {
    archiveUploadId: normalizedUploadId,
    accountId,
    tweetIds: [...tweetIds].sort((left, right) =>
      BigInt(left) < BigInt(right) ? -1 : BigInt(left) > BigInt(right) ? 1 : 0,
    ),
  }
}

export function collectArchivePolicyCandidates(
  archive: any,
): ArchivePolicyCandidate[] {
  const candidates = new Map<string, ArchivePolicyCandidate>()
  const add = (
    accountIdValue: unknown,
    usernameValue: unknown,
    tweetIdValue: unknown,
  ) => {
    const accountId = asUInt64(accountIdValue)
    const username = asUsername(usernameValue)
    const tweetId = asUInt64(tweetIdValue)
    if (!accountId && !username && !tweetId) return
    const key = candidateKey(accountId, username, tweetId)
    candidates.set(key, { key, accountId, username, tweetId })
  }

  for (const record of archive?.tweets ?? []) {
    const tweet = record?.tweet
    if (!tweet) continue

    for (const mention of tweet.entities?.user_mentions ?? []) {
      add(mention?.id_str ?? mention?.id, mention?.screen_name, null)
    }

    add(
      tweet.in_reply_to_user_id_str ?? tweet.in_reply_to_user_id,
      tweet.in_reply_to_screen_name,
      tweet.in_reply_to_status_id_str ?? tweet.in_reply_to_status_id,
    )

    for (const url of tweet.entities?.urls ?? []) {
      const target = quoteTarget(url?.expanded_url)
      if (target) add(null, target.username, target.tweetId)
    }

    const target = retweetTarget(tweet)
    if (target) add(null, target.username, target.tweetId)
  }

  return [...candidates.values()]
}

function emptyBatch(): ArchiveClickHouseBatch {
  return {
    account_observations: [],
    tweet_content_versions: [],
    tweet_engagement_observations: [],
    tweet_analytics_versions: [],
    tweet_archive_provenance: [],
    tweet_mentions: [],
    tweet_relationships: [],
    tweet_media_versions: [],
    tweet_url_versions: [],
  }
}

function addAccountTombstone(
  batch: ArchiveClickHouseBatch,
  manifest: ArchiveClickHouseManifest,
  accountId: string,
  observedAt: string,
  suffix: string,
): void {
  batch.account_observations.push({
    account_id: accountId,
    is_tombstone: 1,
    username: '',
    account_display_name: '',
    account_created_at: null,
    num_tweets: null,
    num_following: null,
    num_followers: null,
    num_likes: null,
    bio: null,
    website: null,
    location: null,
    avatar_media_url: null,
    header_media_url: null,
    source: ARCHIVE_CLICKHOUSE_TOMBSTONE_SOURCE,
    event_id: `${eventPrefix(manifest)}:tombstone:account:${suffix}:${accountId}`,
    observed_at: observedAt,
  })
}

function addTweetTombstone(
  batch: ArchiveClickHouseBatch,
  manifest: ArchiveClickHouseManifest,
  tweetId: string,
  accountId: string | null,
  observedAt: string,
  suffix: string,
): void {
  const content = {
    tweet_id: tweetId,
    account_id: accountId ?? '0',
    is_tombstone: 1,
    created_at: EPOCH,
    full_text: '',
    reply_to_tweet_id: null,
    reply_to_user_id: null,
    reply_to_username: null,
    source: ARCHIVE_CLICKHOUSE_TOMBSTONE_SOURCE,
    event_id: `${eventPrefix(manifest)}:tombstone:tweet:${suffix}:${tweetId}`,
    observed_at: observedAt,
  }
  batch.tweet_content_versions.push(content)
  batch.tweet_analytics_versions.push({
    ...content,
    favorite_count: 0,
    retweet_count: 0,
  })
}

export function buildArchiveTombstoneBatch(
  manifest: ArchiveClickHouseManifest,
  observedAt = new Date().toISOString(),
): ArchiveClickHouseBatch {
  const batch = emptyBatch()
  addAccountTombstone(batch, manifest, manifest.accountId, observedAt, 'owner')
  for (const tweetId of manifest.tweetIds) {
    addTweetTombstone(
      batch,
      manifest,
      tweetId,
      manifest.accountId,
      observedAt,
      'owner',
    )
    batch.tweet_archive_provenance.push({
      tweet_id: tweetId,
      archive_upload_id: manifest.archiveUploadId,
      source: ARCHIVE_CLICKHOUSE_TOMBSTONE_SOURCE,
      event_id: `${eventPrefix(manifest)}:provenance:${tweetId}`,
      observed_at: observedAt,
    })
  }
  return deduplicateBatch(batch)
}

function decisionFor(
  decisions: ArchivePolicyDecisions,
  accountIdValue: unknown,
  usernameValue: unknown,
  tweetIdValue: unknown,
): ArchivePolicyDecision {
  const accountId = asUInt64(accountIdValue)
  const username = asUsername(usernameValue)
  const tweetId = asUInt64(tweetIdValue)
  return (
    decisions.get(candidateKey(accountId, username, tweetId)) ?? {
      accountId,
      blocked: false,
    }
  )
}

function addBlockedTarget(
  batch: ArchiveClickHouseBatch,
  manifest: ArchiveClickHouseManifest,
  decision: ArchivePolicyDecision,
  tweetId: string | null,
  observedAt: string,
): void {
  if (!decision.blocked) return
  if (decision.accountId) {
    addAccountTombstone(
      batch,
      manifest,
      decision.accountId,
      observedAt,
      'target',
    )
  }
  if (tweetId) {
    addTweetTombstone(
      batch,
      manifest,
      tweetId,
      decision.accountId,
      observedAt,
      'target',
    )
  }
}

export function buildArchiveClickHouseBatch(
  archive: any,
  manifest: ArchiveClickHouseManifest,
  decisions: ArchivePolicyDecisions,
  observedAt = new Date().toISOString(),
): ArchiveClickHouseBatch {
  const account = archive?.account?.[0]?.account
  if (asUInt64(account?.accountId) !== manifest.accountId) {
    throw new ArchiveClickHouseError('archive_owner_mismatch')
  }

  const batch = emptyBatch()
  const manifestTweetIds = new Set(manifest.tweetIds)
  const profile = archive?.profile?.[0]?.profile
  batch.account_observations.push({
    account_id: manifest.accountId,
    is_tombstone: 0,
    username: asUsername(account?.username) ?? '',
    account_display_name: cleanText(account?.accountDisplayName),
    account_created_at: nullableDate(account?.createdAt),
    num_tweets: (archive?.tweets ?? []).length,
    num_following: (archive?.following ?? []).length,
    num_followers: (archive?.follower ?? []).length,
    num_likes: (archive?.like ?? []).length,
    bio: cleanText(profile?.description?.bio) || null,
    website: cleanText(profile?.description?.website) || null,
    location: cleanText(profile?.description?.location) || null,
    avatar_media_url: cleanText(profile?.avatarMediaUrl) || null,
    header_media_url: cleanText(profile?.headerMediaUrl) || null,
    source: ARCHIVE_CLICKHOUSE_SOURCE,
    event_id: `${eventPrefix(manifest)}:account:${manifest.accountId}`,
    observed_at: observedAt,
  })

  for (const record of archive?.tweets ?? []) {
    const tweet = record?.tweet
    const tweetId = asUInt64(tweet?.id_str ?? tweet?.id)
    if (!tweetId || !manifestTweetIds.has(tweetId)) continue

    const replyTweetId = asUInt64(
      tweet?.in_reply_to_status_id_str ?? tweet?.in_reply_to_status_id,
    )
    const replyAccountId = asUInt64(
      tweet?.in_reply_to_user_id_str ?? tweet?.in_reply_to_user_id,
    )
    const replyUsername = asUsername(tweet?.in_reply_to_screen_name)
    const replyDecision = decisionFor(
      decisions,
      replyAccountId,
      replyUsername,
      replyTweetId,
    )
    addBlockedTarget(batch, manifest, replyDecision, replyTweetId, observedAt)

    const retweet = retweetTarget(tweet)
    const retweetDecision = retweet
      ? decisionFor(decisions, null, retweet.username, retweet.tweetId)
      : { accountId: null, blocked: false }
    if (retweet) {
      addBlockedTarget(
        batch,
        manifest,
        retweetDecision,
        retweet.tweetId,
        observedAt,
      )
    }

    // A Twitter archive's RT text is a copy of the target author's content.
    // Keep the allowed retweet record and edge, but never duplicate a blocked
    // target's text into the allowed author's row.
    const fullText = retweetDecision.blocked ? '' : cleanText(tweet?.full_text)
    const createdAt = nullableDate(tweet?.created_at) ?? EPOCH
    const tweetEventId = `${eventPrefix(manifest)}:tweet:${tweetId}`
    const content = {
      tweet_id: tweetId,
      account_id: manifest.accountId,
      is_tombstone: 0,
      created_at: createdAt,
      full_text: fullText,
      reply_to_tweet_id: replyTweetId,
      reply_to_user_id: replyAccountId,
      // The stable target IDs preserve the reply; usernames are deliberately
      // not duplicated into ClickHouse.
      reply_to_username: null,
      source: ARCHIVE_CLICKHOUSE_SOURCE,
      event_id: tweetEventId,
      observed_at: observedAt,
    }
    batch.tweet_content_versions.push(content)
    batch.tweet_engagement_observations.push({
      tweet_id: tweetId,
      favorite_count: nonnegativeInteger(tweet?.favorite_count),
      retweet_count: nonnegativeInteger(tweet?.retweet_count),
      source: ARCHIVE_CLICKHOUSE_SOURCE,
      event_id: tweetEventId,
      observed_at: observedAt,
    })
    batch.tweet_analytics_versions.push({
      ...content,
      favorite_count: nonnegativeInteger(tweet?.favorite_count),
      retweet_count: nonnegativeInteger(tweet?.retweet_count),
    })
    batch.tweet_archive_provenance.push({
      tweet_id: tweetId,
      archive_upload_id: manifest.archiveUploadId,
      source: ARCHIVE_CLICKHOUSE_SOURCE,
      event_id: `${eventPrefix(manifest)}:provenance:${tweetId}`,
      observed_at: observedAt,
    })

    if (replyTweetId) {
      batch.tweet_relationships.push({
        tweet_id: tweetId,
        relationship_type: 'reply',
        related_tweet_id: replyTweetId,
        source: ARCHIVE_CLICKHOUSE_SOURCE,
        event_id: `${eventPrefix(manifest)}:reply:${tweetId}:${replyTweetId}`,
        observed_at: observedAt,
      })
    }

    for (const mention of tweet?.entities?.user_mentions ?? []) {
      const mentionedAccountId = asUInt64(mention?.id_str ?? mention?.id)
      if (!mentionedAccountId) continue
      const mentionDecision = decisionFor(
        decisions,
        mentionedAccountId,
        mention?.screen_name,
        null,
      )
      addBlockedTarget(batch, manifest, mentionDecision, null, observedAt)
      batch.tweet_mentions.push({
        tweet_id: tweetId,
        mentioned_account_id: mentionedAccountId,
        source: ARCHIVE_CLICKHOUSE_SOURCE,
        event_id: `${eventPrefix(manifest)}:mention:${tweetId}:${mentionedAccountId}`,
        observed_at: observedAt,
      })
    }

    for (const url of tweet?.entities?.urls ?? []) {
      const quoted = quoteTarget(url?.expanded_url)
      if (quoted) {
        const quoteDecision = decisionFor(
          decisions,
          null,
          quoted.username,
          quoted.tweetId,
        )
        addBlockedTarget(
          batch,
          manifest,
          quoteDecision,
          quoted.tweetId,
          observedAt,
        )
        batch.tweet_relationships.push({
          tweet_id: tweetId,
          relationship_type: 'quote',
          related_tweet_id: quoted.tweetId,
          source: ARCHIVE_CLICKHOUSE_SOURCE,
          event_id: `${eventPrefix(manifest)}:quote:${tweetId}:${quoted.tweetId}`,
          observed_at: observedAt,
        })
        // The stable relationship replaces the content-bearing URL metadata
        // when its target author is blocked.
        if (quoteDecision.blocked) continue
      }

      const urlValue = cleanText(url?.url)
      if (!urlValue) continue
      batch.tweet_url_versions.push({
        tweet_id: tweetId,
        url: urlValue,
        expanded_url: cleanText(url?.expanded_url) || null,
        display_url: cleanText(url?.display_url),
        source: ARCHIVE_CLICKHOUSE_SOURCE,
        event_id: `${eventPrefix(manifest)}:url:${tweetId}:${urlValue}`,
        observed_at: observedAt,
      })
    }

    for (const media of getArchiveTweetMedia(tweet ?? {})) {
      const mediaId = asUInt64(media?.id_str ?? media?.id)
      const mediaUrl = cleanText(media?.media_url_https ?? media?.media_url)
      if (!mediaId || !mediaUrl) continue
      batch.tweet_media_versions.push({
        media_id: mediaId,
        tweet_id: tweetId,
        media_type: cleanText(media?.type),
        media_url: mediaUrl,
        width: nonnegativeInteger(media?.sizes?.large?.w) || null,
        height: nonnegativeInteger(media?.sizes?.large?.h) || null,
        source: ARCHIVE_CLICKHOUSE_SOURCE,
        event_id: `${eventPrefix(manifest)}:media:${mediaId}`,
        observed_at: observedAt,
      })
    }

    if (retweet) {
      batch.tweet_relationships.push({
        tweet_id: tweetId,
        relationship_type: 'retweet',
        related_tweet_id: retweet.tweetId,
        source: ARCHIVE_CLICKHOUSE_SOURCE,
        event_id: `${eventPrefix(manifest)}:retweet:${tweetId}:${retweet.tweetId}`,
        observed_at: observedAt,
      })
    }
  }

  return deduplicateBatch(batch)
}

function deduplicateBatch<T extends object>(batch: T): T {
  return Object.fromEntries(
    Object.entries(batch).map(([table, rows]) => {
      const byEvent = new Map<string, Record<string, unknown>>()
      for (const row of rows as Record<string, unknown>[]) {
        byEvent.set(String(row.event_id), row)
      }
      return [table, [...byEvent.values()]]
    }),
  ) as unknown as T
}

/**
 * Likes and follow edges from the archive owner's like.js, follower.js and
 * following.js, mirroring the PostgreSQL processor. Liked tweets are written
 * as content-free tombstones exactly as the processor upserts
 * public.liked_tweets, so a new upload never re-publishes third-party text.
 * Targets keep their stable IDs; the owner policy check happens before this.
 */
export function buildArchiveGraphBatch(
  archive: any,
  manifest: ArchiveClickHouseManifest,
  observedAt = new Date().toISOString(),
): ArchiveClickHouseGraphBatch {
  if (asUInt64(archive?.account?.[0]?.account?.accountId) !== manifest.accountId) {
    throw new ArchiveClickHouseError('archive_owner_mismatch')
  }
  const prefix = eventPrefix(manifest)
  const batch: ArchiveClickHouseGraphBatch = {
    account_likes: [],
    liked_tweet_versions: [],
    account_follows: [],
  }

  for (const record of archive?.like ?? []) {
    const likedTweetId = asUInt64(record?.like?.tweetId)
    if (!likedTweetId) continue
    batch.account_likes.push({
      account_id: manifest.accountId,
      liked_tweet_id: likedTweetId,
      archive_upload_id: manifest.archiveUploadId,
      is_tombstone: 0,
      source: ARCHIVE_CLICKHOUSE_SOURCE,
      event_id: `${prefix}:like:${likedTweetId}`,
      observed_at: observedAt,
    })
    batch.liked_tweet_versions.push({
      tweet_id: likedTweetId,
      author_account_id: null,
      full_text: '',
      is_tombstone: 1,
      source: ARCHIVE_CLICKHOUSE_SOURCE,
      event_id: `${prefix}:liked_tweet:${likedTweetId}`,
      observed_at: observedAt,
    })
  }

  const follows: [direction: 'follower' | 'following', records: any[], key: string][] = [
    ['follower', archive?.follower ?? [], 'follower'],
    ['following', archive?.following ?? [], 'following'],
  ]
  for (const [direction, records, key] of follows) {
    for (const record of records) {
      const relatedAccountId = asUInt64(record?.[key]?.accountId)
      if (!relatedAccountId) continue
      batch.account_follows.push({
        account_id: manifest.accountId,
        direction,
        related_account_id: relatedAccountId,
        archive_upload_id: manifest.archiveUploadId,
        is_tombstone: 0,
        source: ARCHIVE_CLICKHOUSE_SOURCE,
        event_id: `${prefix}:${direction}:${relatedAccountId}`,
        observed_at: observedAt,
      })
    }
  }

  return deduplicateBatch(batch)
}

/**
 * Resolve a queued purge into ClickHouse predicates under the policy lock.
 * Plans depend only on current PostgreSQL state, so replaying an old request
 * (for example after a backfill) never removes rows that are still valid.
 */
export function planArchiveGraphPurge(
  request: ArchiveGraphPurgeRequest,
  state: Pick<ArchiveGraphPurgeState, 'existingUploadIds' | 'ownerBlocked' | 'maxUploadId'>,
): ArchiveGraphPurgePlan {
  const accountId = asUInt64(request.account_id)
  const requestId = asUInt64(request.id)
  const maxUploadId = asUInt64(state.maxUploadId)
  if (!accountId || !requestId || !maxUploadId) {
    throw new ArchiveClickHouseError('invalid_graph_purge_request')
  }
  const ownerBlocked = state.ownerBlocked
  const existing = state.existingUploadIds
    .map(asUInt64)
    .filter((value): value is string => Boolean(value))
  if (request.purge_scope === 'archive_upload') {
    const archiveUploadId = asUInt64(request.archive_upload_id)
    if (!archiveUploadId || request.reason !== 'delete_single_archive') {
      throw new ArchiveClickHouseError('invalid_graph_purge_request')
    }
    return {
      accountId,
      archiveUploadId,
      keepUploadIds: [],
      maxUploadId,
      purgeLikedTweetAuthor: false,
      requestId,
    }
  }
  if (request.purge_scope !== 'account') {
    throw new ArchiveClickHouseError('invalid_graph_purge_request')
  }
  if (request.reason === 'policy_tombstone') {
    // A blocked account keeps nothing. tombstone_policy_account deleted every
    // upload it had, so after a later opt-in only newer uploads remain.
    return {
      accountId,
      archiveUploadId: null,
      keepUploadIds: ownerBlocked ? [] : existing,
      maxUploadId,
      purgeLikedTweetAuthor: true,
      requestId,
    }
  }
  if (request.reason !== 'delete_user_archive') {
    throw new ArchiveClickHouseError('invalid_graph_purge_request')
  }
  // Uploads created after the deletion belong to a new upload and stay.
  return {
    accountId,
    archiveUploadId: null,
    keepUploadIds: existing,
    maxUploadId,
    purgeLikedTweetAuthor: false,
    requestId,
  }
}

export async function attemptArchiveGraphPurge(
  options: ArchiveGraphPurgeAttemptOptions,
): Promise<ArchiveGraphPurgeAttemptResult> {
  const accountId = asUInt64(options.request.account_id)
  if (!accountId) {
    const errorCode = 'invalid_graph_purge_request'
    await options.markPending(errorCode)
    return { status: 'pending', errorCode }
  }
  try {
    const state = await options.readStateUnderPolicyLock(accountId)
    if (!state.requestPending) return { status: 'completed' }
    const plan = planArchiveGraphPurge(options.request, state)
    await options.sink.purgeGraph(plan)
    await options.markCompleted([plan.requestId, ...state.coveredRequestIds])
    return { status: 'completed' }
  } catch (error) {
    const errorCode = error instanceof ArchiveClickHouseError
      ? error.code
      : 'archive_clickhouse_graph_purge_failed'
    await options.markPending(errorCode)
    return { status: 'pending', errorCode }
  }
}

export function safeArchiveClickHouseErrorCode(error: unknown): string {
  if (error instanceof ArchiveClickHouseError) return error.code
  return 'archive_clickhouse_delivery_failed'
}

export async function attemptArchiveClickHouseDelivery(
  options: ArchiveDeliveryAttemptOptions,
): Promise<ArchiveDeliveryAttemptResult> {
  const manifest: ArchiveClickHouseManifest = {
    archiveUploadId: asUInt64(options.delivery.archive_upload_id) ?? '',
    accountId: asUInt64(options.delivery.account_id) ?? '',
    tweetIds: (options.delivery.tweet_ids ?? [])
      .map(asUInt64)
      .filter((value): value is string => Boolean(value)),
  }
  if (!manifest.archiveUploadId || !manifest.accountId) {
    const errorCode = 'invalid_delivery_manifest'
    await options.markPending(errorCode)
    return { status: 'pending', errorCode }
  }

  try {
    await options.withOwnerPolicyLock(manifest.accountId, async (context) => {
      const observedAt = (options.now ?? (() => new Date()))().toISOString()
      let batch: ArchiveClickHouseBatch
      let graphBatch: ArchiveClickHouseGraphBatch | null = null
      if (context.ownerBlocked) {
        // An opted-out owner contributes no likes or follow edges; the
        // policy purge removes anything delivered before the opt-out.
        batch = buildArchiveTombstoneBatch(manifest, observedAt)
      } else {
        const archive =
          options.archive ??
          (options.delivery.username && options.loadArchive
            ? await options.loadArchive(options.delivery.username)
            : null)
        if (!archive) {
          throw new ArchiveClickHouseError('archive_source_unavailable')
        }
        const archiveManifest = createArchiveClickHouseManifest(
          archive,
          manifest.archiveUploadId,
        )
        if (
          archiveManifest.accountId !== manifest.accountId ||
          archiveManifest.tweetIds.join(',') !== manifest.tweetIds.join(',')
        ) {
          throw new ArchiveClickHouseError('archive_manifest_mismatch')
        }
        const candidates = collectArchivePolicyCandidates(archive)
        const decisions = await context.resolvePolicies(candidates)
        batch = buildArchiveClickHouseBatch(
          archive,
          manifest,
          decisions,
          observedAt,
        )
        if (context.graphEligible) {
          graphBatch = buildArchiveGraphBatch(archive, manifest, observedAt)
        }
      }

      await options.sink.writeBatch(batch)
      if (graphBatch) {
        if (!options.sink.writeGraphBatch) {
          throw new ArchiveClickHouseError('clickhouse_graph_sink_missing')
        }
        await options.sink.writeGraphBatch(graphBatch)
      }
      await context.markDelivered()
    })
    return { status: 'delivered' }
  } catch (error) {
    const errorCode = safeArchiveClickHouseErrorCode(error)
    await options.markPending(errorCode)
    return { status: 'pending', errorCode }
  }
}

export class ArchiveClickHouseSink {
  constructor(
    private readonly url: string,
    private readonly database: string,
    private readonly user: string,
    private readonly password: string,
  ) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(database)) {
      throw new ArchiveClickHouseError('invalid_clickhouse_database')
    }
  }

  async healthCheck(): Promise<void> {
    const health = await this.request('SELECT 1')
    if (health.trim() !== '1') {
      throw new ArchiveClickHouseError('clickhouse_health_failed')
    }
    const tableReadiness = await this.request(`
      SELECT count()
      FROM system.tables
      WHERE database = '${this.database}'
        AND name IN (
          'account_observations',
          'tweet_content_versions',
          'tweet_engagement_observations',
          'tweet_analytics_versions',
          'tweet_archive_provenance',
          'tweet_mentions',
          'tweet_relationships',
          'tweet_media_versions',
          'tweet_url_versions'
        )
    `)
    if (tableReadiness.trim() !== '9') {
      throw new ArchiveClickHouseError('clickhouse_archive_schema_missing')
    }
    const tombstoneReadiness = await this.request(`
      SELECT count()
      FROM system.columns
      WHERE database = '${this.database}'
        AND (table, name) IN (
          ('account_observations', 'is_tombstone'),
          ('tweet_content_versions', 'is_tombstone'),
          ('tweet_analytics_versions', 'is_tombstone')
        )
    `)
    if (tombstoneReadiness.trim() !== '3') {
      throw new ArchiveClickHouseError('clickhouse_tombstone_schema_missing')
    }
  }

  /** Required before likes/follows delivery or purges are enabled. */
  async graphHealthCheck(): Promise<void> {
    const readiness = await this.request(`
      SELECT count()
      FROM system.columns
      WHERE database = '${this.database}'
        AND (table, name) IN (
          ('account_likes', 'archive_upload_id'),
          ('account_likes', 'is_tombstone'),
          ('liked_tweet_versions', 'author_account_id'),
          ('liked_tweet_versions', 'is_tombstone'),
          ('account_follows', 'direction'),
          ('account_follows', 'archive_upload_id'),
          ('account_follows', 'is_tombstone')
        )
    `)
    if (readiness.trim() !== '7') {
      throw new ArchiveClickHouseError('clickhouse_graph_schema_missing')
    }
  }

  async writeBatch(batch: ArchiveClickHouseBatch): Promise<void> {
    for (const [table, rows] of Object.entries(batch)) {
      if (rows.length === 0) continue
      const body = rows.map((row) => JSON.stringify(row)).join('\n')
      await this.request(
        `INSERT INTO ${this.database}.${table} FORMAT JSONEachRow`,
        body,
      )
    }
  }

  /** Archives can hold hundreds of thousands of likes; bound each request. */
  async writeGraphBatch(batch: ArchiveClickHouseGraphBatch): Promise<void> {
    for (const table of ARCHIVE_CLICKHOUSE_GRAPH_TABLES) {
      const rows = batch[table]
      for (let start = 0; start < rows.length; start += GRAPH_INSERT_CHUNK_ROWS) {
        const body = rows
          .slice(start, start + GRAPH_INSERT_CHUNK_ROWS)
          .map((row) => JSON.stringify(row))
          .join('\n')
        await this.request(
          `INSERT INTO ${this.database}.${table} FORMAT JSONEachRow`,
          body,
        )
      }
    }
  }

  /**
   * Physically remove the purged likes and follow edges, then verify none
   * remain. A tombstone row would still name (account, target), so edge
   * purges never leave one. Opt-outs also tombstone liked-tweet text written
   * by the account, matching tombstone_policy_account in PostgreSQL. Every
   * step is idempotent; a timed-out mutation is re-verified on retry.
   */
  async purgeGraph(plan: ArchiveGraphPurgePlan): Promise<void> {
    const params: Record<string, string> = {
      account_id: plan.accountId,
      upload_id: plan.archiveUploadId ?? '0',
      keep_upload_ids: `[${plan.keepUploadIds.join(',')}]`,
      max_upload_id: plan.maxUploadId,
      source: ARCHIVE_CLICKHOUSE_GRAPH_PURGE_SOURCE,
      event_prefix: `graph_purge:${plan.requestId}:liked_tweet:`,
    }
    const edgePredicate = plan.archiveUploadId
      ? 'account_id = {account_id:UInt64} AND archive_upload_id = {upload_id:UInt64}'
      : 'account_id = {account_id:UInt64} AND archive_upload_id <= {max_upload_id:UInt64} AND NOT has({keep_upload_ids:Array(UInt64)}, archive_upload_id)'

    for (const table of ['account_likes', 'account_follows']) {
      await this.deleteUntilAbsent(table, edgePredicate, params)
    }

    if (plan.purgeLikedTweetAuthor) {
      await this.command(
        `INSERT INTO ${this.database}.liked_tweet_versions
          (tweet_id, author_account_id, full_text, is_tombstone, source, event_id, observed_at)
         SELECT tweet_id, author_account_id, '', 1, {source:String},
                concat({event_prefix:String}, toString(tweet_id)), now64(3)
         FROM ${this.database}.liked_tweet_versions
         WHERE author_account_id = {account_id:UInt64}
           AND is_tombstone = 0
         GROUP BY tweet_id, author_account_id`,
        params,
      )
      await this.deleteUntilAbsent(
        'liked_tweet_versions',
        'author_account_id = {account_id:UInt64} AND is_tombstone = 0',
        params,
      )
    }
  }

  private async deleteUntilAbsent(
    table: string,
    predicate: string,
    params: Record<string, string>,
  ): Promise<void> {
    const remaining = () =>
      this.command(
        `SELECT count() FROM ${this.database}.${table} WHERE ${predicate}`,
        params,
      ).then((value) => value.trim())
    if ((await remaining()) === '0') return
    await this.command(
      `ALTER TABLE ${this.database}.${table} DELETE WHERE ${predicate}
       SETTINGS mutations_sync = 2`,
      params,
      GRAPH_PURGE_TIMEOUT_MS,
    )
    if ((await remaining()) !== '0') {
      throw new ArchiveClickHouseError('clickhouse_graph_purge_incomplete')
    }
  }

  /** POST a statement with typed query parameters instead of interpolation. */
  private async command(
    query: string,
    params: Record<string, string>,
    timeoutMs = 30_000,
  ): Promise<string> {
    const endpoint = new URL(this.url)
    endpoint.searchParams.set('database', this.database)
    // The writer's profile defaults to a 15-second limit; a synchronous
    // mutation legitimately waits longer.
    endpoint.searchParams.set('max_execution_time', String(Math.ceil(timeoutMs / 1000)))
    for (const [key, value] of Object.entries(params)) {
      endpoint.searchParams.set(`param_${key}`, value)
    }
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.user}:${this.password}`).toString('base64')}`,
        'Content-Type': 'text/plain; charset=utf-8',
      },
      body: query,
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) {
      throw new ArchiveClickHouseError(`clickhouse_http_${response.status}`)
    }
    return response.text()
  }

  private async request(query: string, body?: string): Promise<string> {
    const endpoint = new URL(this.url)
    endpoint.searchParams.set('query', query)
    endpoint.searchParams.set('date_time_input_format', 'best_effort')
    const response = await fetch(endpoint, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.user}:${this.password}`).toString('base64')}`,
        ...(body === undefined
          ? {}
          : { 'Content-Type': 'application/x-ndjson' }),
      },
      body,
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) {
      // Never include the response body: ClickHouse parse errors can echo
      // archive content from the rejected row.
      throw new ArchiveClickHouseError(`clickhouse_http_${response.status}`)
    }
    return response.text()
  }
}
