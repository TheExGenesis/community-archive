import 'server-only'

import { sortNotices, visibleStatus } from '@/lib/bulletin/board'
import {
  hydrateBulletinNotices,
  loadBulletinRelationshipsForAccount,
  verifyBulletinResolutions,
  type StoredNotice,
} from '@/lib/bulletin/data'
import { cardLabel, type Notice } from '@/lib/bulletin/types'
import { hydrateBulletinTweets } from '@/lib/bulletin/tweets'
import type { DigestEdition } from '@/lib/digest/types'
import type { PortalTweet } from '@/lib/portal/types'
import { getCurrentUser } from '@/lib/portal/auth'
import { createServerServiceRoleClient } from '@/utils/supabase'

export const DIGEST_BULLETIN_LIMIT = 3
const CANDIDATE_LIMIT = 100
const DETAIL_LIMIT = 8

export type DigestBulletinItem = {
  side: Notice['side']
  kind: Notice['kind']
  summary: string
  label: string
  tweet: PortalTweet
}

export type DigestBulletinSelection = {
  itemsForAccount: (accountId?: string | null) => Promise<DigestBulletinItem[]>
}

/** Verify notices posted in the edition window, then rank for each reader. */
export async function prepareDigestBulletinItems(
  edition: DigestEdition,
): Promise<DigestBulletinSelection> {
  const empty: DigestBulletinSelection = { itemsForAccount: async () => [] }
  if (edition.isPreview) return empty

  const start = Date.parse(edition.content.windowStart)
  const end = Date.parse(edition.content.windowEnd)
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end)
    return empty

  // The private RPC applies current membership, opt-out, and scrape-block
  // policy. Source hydration below also checks the current author/text/hash.
  const { data, error } = await createServerServiceRoleClient().rpc(
    'get_bulletin_board_state',
    { max_results: 2000 },
  )
  if (error) throw new Error('Digest bulletin notices could not be loaded')

  const now = Date.now()
  const candidates = (
    sortNotices(
      ((data ?? []) as unknown as StoredNotice[]).filter((notice) => {
        const posted = Date.parse(notice.posted_at)
        return Number.isFinite(posted) && posted >= start && posted < end
      }),
      true,
      '',
      { outgoing: {}, available: false },
      now,
      false,
      false,
    ) as StoredNotice[]
  ).slice(0, CANDIDATE_LIMIT)

  await verifyBulletinResolutions(candidates)
  const hydrated = await hydrateBulletinNotices({ notices: candidates })
  const stored = new Map(candidates.map((notice) => [notice.tweet_id, notice]))
  const details = new Map<string, PortalTweet | null>()
  const selections = new Map<string, Promise<DigestBulletinItem[]>>()

  async function select(
    accountId: string | null,
  ): Promise<DigestBulletinItem[]> {
    const graph = accountId
      ? await loadBulletinRelationshipsForAccount(accountId)
      : { outgoing: {}, available: false }
    const eligible = sortNotices(
      hydrated.filter((notice) => visibleStatus(notice, now, false, false)),
      true,
      accountId ?? '',
      graph,
      now,
    ).slice(0, DETAIL_LIMIT)

    for (
      let offset = 0;
      offset < eligible.length;
      offset += DIGEST_BULLETIN_LIMIT
    ) {
      const batch = eligible.slice(offset, offset + DIGEST_BULLETIN_LIMIT)
      const missing = batch.filter((notice) => !details.has(notice.tweet_id))
      if (missing.length) {
        const { tweets } = await hydrateBulletinTweets(
          missing.map((notice) => notice.tweet_id),
          {
            notices: missing.flatMap((notice) => {
              const source = stored.get(notice.tweet_id)
              return source ? [source] : []
            }),
          },
        )
        for (const notice of missing) details.set(notice.tweet_id, null)
        for (const tweet of tweets) details.set(tweet.id, tweet)
      }
      if (
        eligible
          .slice(0, offset + DIGEST_BULLETIN_LIMIT)
          .filter((notice) => details.get(notice.tweet_id)).length >=
        DIGEST_BULLETIN_LIMIT
      )
        break
    }
    return eligible
      .flatMap((notice: Notice) => {
        const tweet = details.get(notice.tweet_id)
        return tweet
          ? [
              {
                side: notice.side,
                kind: notice.kind,
                summary: notice.summary,
                label: cardLabel(notice),
                tweet,
              },
            ]
          : []
      })
      .slice(0, DIGEST_BULLETIN_LIMIT)
  }

  return {
    itemsForAccount(accountId = null) {
      const key = accountId ?? ''
      if (!selections.has(key)) selections.set(key, select(accountId))
      return selections.get(key)!
    },
  }
}

/** Published digest pages use the shared, unpersonalized selection. */
export async function loadDigestBulletinItems(
  edition: DigestEdition,
): Promise<DigestBulletinItem[]> {
  return (await prepareDigestBulletinItems(edition)).itemsForAccount()
}

/** Use the signed-in account's trusted X identity for the website picks. */
export async function loadDigestBulletinItemsForViewer(edition: DigestEdition) {
  const [selection, user] = await Promise.all([
    prepareDigestBulletinItems(edition),
    getCurrentUser(),
  ])
  const providerId = user?.app_metadata?.provider_id
  const accountId =
    typeof providerId === 'string' && /^\d{1,20}$/.test(providerId)
      ? providerId
      : null
  return {
    items: await selection.itemsForAccount(accountId),
    personalized: accountId !== null,
  }
}
