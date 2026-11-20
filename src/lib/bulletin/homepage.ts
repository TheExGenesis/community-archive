import 'server-only'

import { sortNotices, visibleStatus } from './board'
import { matchesJevFilters } from './curation'
import {
  loadBulletinDismissalsForUser,
  loadBulletinRelationshipsForAccount,
  loadPublicBulletinBoard,
} from './data'
import { HOMEPAGE_BULLETIN_LIMIT, mixOffersAndAsks } from './mix'
import { hydrateBulletinTweets } from './tweets'
import {
  cardLabel,
  DEFAULT_BULLETIN_FILTERS,
  KIND_LABELS,
  type Notice,
} from './types'
import type { DigestBulletinItem } from '@/lib/digest/bulletin'
import type { PortalTweet } from '@/lib/portal/types'

// Full tweet cards for the picks. Each costs a thread read, and the same few
// picks repeat across homepage views, so keep them briefly on the instance.
const DETAIL_TTL_MS = 10 * 60_000
const DETAIL_MAX_ENTRIES = 300
const details = new Map<string, { at: number; tweet: PortalTweet | null }>()

function cachedDetail(id: string) {
  const hit = details.get(id)
  return hit && Date.now() - hit.at < DETAIL_TTL_MS ? hit : undefined
}
function rememberDetail(id: string, tweet: PortalTweet | null) {
  details.delete(id)
  details.set(id, { at: Date.now(), tweet })
  if (details.size > DETAIL_MAX_ENTRIES)
    details.delete(details.keys().next().value!)
}

/**
 * The full-tweet read can lack the author's profile ('unknown_user'); the
 * source check already read it, so use that instead of a placeholder.
 */
function withAuthor(tweet: PortalTweet, notice: Notice): PortalTweet {
  const unknown = !tweet.username || tweet.username === 'unknown_user'
  if (!unknown && tweet.name && tweet.name !== 'unknown_user') return tweet
  const username = unknown ? notice.username || tweet.username : tweet.username
  return {
    ...tweet,
    username,
    name:
      notice.display_name ||
      (tweet.name && tweet.name !== 'unknown_user' ? tweet.name : username),
    avatar: tweet.avatar || notice.avatar_url || null,
  }
}

/**
 * Homepage picks: live, unresolved notices above the Bulletin's default
 * quality bar, ranked like the board's Recommended view (personal when the
 * reader is signed in), then mixed so the first three are offers and about a
 * third are asks.
 */
export async function loadHomepageBulletinItems({
  accountId,
  userId,
}: {
  accountId: string | null
  userId: string | null
}): Promise<DigestBulletinItem[]> {
  const [board, graph, hidden] = await Promise.all([
    loadPublicBulletinBoard(),
    accountId
      ? loadBulletinRelationshipsForAccount(accountId)
      : { outgoing: {}, available: false },
    userId
      ? loadBulletinDismissalsForUser(userId).catch(() => [] as string[])
      : ([] as string[]),
  ])
  const now = Date.now()
  const dismissed = new Set(hidden)
  const cards = board.notices.flatMap((o) => {
    const card = board.sources.get(o.tweet_id)
    return card &&
      o.kind in KIND_LABELS &&
      !dismissed.has(o.tweet_id) &&
      matchesJevFilters(card, DEFAULT_BULLETIN_FILTERS) &&
      visibleStatus(card, now, false, false)
      ? [card]
      : []
  })
  const ranked = sortNotices(
    cards,
    true,
    accountId ?? '',
    graph,
    now,
    false,
    false,
  )

  // Replace a pick whose full tweet cannot be shown with the next one.
  const failed = new Set<string>()
  let picks: Notice[] = []
  for (let round = 0; round < 3; round++) {
    picks = mixOffersAndAsks(
      ranked.filter((o) => !failed.has(o.tweet_id)),
      HOMEPAGE_BULLETIN_LIMIT,
    )
    const missing = picks
      .map((o) => o.tweet_id)
      .filter((id) => !cachedDetail(id))
    if (missing.length) {
      const { tweets } = await hydrateBulletinTweets(missing, board)
      const found = new Map(tweets.map((t) => [t.id, t]))
      for (const id of missing) {
        const tweet = found.get(id)
        // Replies are for the board's expanded view, not the homepage.
        rememberDetail(
          id,
          tweet ? ({ ...tweet, replies: undefined } as PortalTweet) : null,
        )
      }
    }
    const broken = picks.filter((o) => !cachedDetail(o.tweet_id)?.tweet)
    if (!broken.length) break
    for (const o of broken) failed.add(o.tweet_id)
  }

  return picks.flatMap((notice) => {
    const tweet = cachedDetail(notice.tweet_id)?.tweet
    return tweet
      ? [
          {
            side: notice.side,
            kind: notice.kind,
            summary: notice.title || notice.summary,
            label: cardLabel(notice),
            tweet: withAuthor(tweet, notice),
          },
        ]
      : []
  })
}
