import 'server-only'

import { sortNotices, visibleStatus } from '@/lib/bulletin/board'
import {
  hydrateBulletinNotices,
  verifyBulletinResolutions,
  type StoredNotice,
} from '@/lib/bulletin/data'
import { cardLabel, type Notice } from '@/lib/bulletin/types'
import { hydrateBulletinTweets } from '@/lib/bulletin/tweets'
import type { DigestEdition } from '@/lib/digest/types'
import type { PortalTweet } from '@/lib/portal/types'
import { createServerServiceRoleClient } from '@/utils/supabase'

export const DIGEST_BULLETIN_LIMIT = 4
const CANDIDATE_LIMIT = 100
const DETAIL_LIMIT = 8

export type DigestBulletinItem = {
  summary: string
  label: string
  tweet: PortalTweet
}

type NewNotice = StoredNotice & { created_at: string }

/** A shared selection from notices first added during this edition's window. */
export async function loadDigestBulletinItems(
  edition: DigestEdition,
): Promise<DigestBulletinItem[]> {
  if (edition.isPreview) return []

  const start = Date.parse(edition.content.windowStart)
  const end = Date.parse(edition.content.windowEnd)
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end)
    return []

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
      ((data ?? []) as unknown as NewNotice[]).filter((notice) => {
        const added = Date.parse(notice.created_at)
        return Number.isFinite(added) && added >= start && added < end
      }),
      true,
      '',
      { outgoing: {}, available: false },
      now,
      false,
      false,
    ) as NewNotice[]
  ).slice(0, CANDIDATE_LIMIT)

  await verifyBulletinResolutions(candidates)
  const hydrated = await hydrateBulletinNotices({ notices: candidates })
  const eligible = sortNotices(
    hydrated.filter((notice) => visibleStatus(notice, now, false, false)),
    true,
    '',
    { outgoing: {}, available: false },
    now,
  ).slice(0, DETAIL_LIMIT)
  const stored = new Map(candidates.map((notice) => [notice.tweet_id, notice]))
  const details = new Map<string, PortalTweet>()
  for (
    let offset = 0;
    offset < eligible.length && details.size < DIGEST_BULLETIN_LIMIT;
    offset += DIGEST_BULLETIN_LIMIT
  ) {
    const batch = eligible.slice(offset, offset + DIGEST_BULLETIN_LIMIT)
    const { tweets } = await hydrateBulletinTweets(
      batch.map((notice) => notice.tweet_id),
      {
        notices: batch.flatMap((notice) => {
          const source = stored.get(notice.tweet_id)
          return source ? [source] : []
        }),
      },
    )
    for (const tweet of tweets) details.set(tweet.id, tweet)
  }
  return eligible
    .flatMap((notice: Notice) => {
      const tweet = details.get(notice.tweet_id)
      return tweet
        ? [{ summary: notice.summary, label: cardLabel(notice), tweet }]
        : []
    })
    .slice(0, DIGEST_BULLETIN_LIMIT)
}
