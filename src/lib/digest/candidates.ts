import {
  fetchPortalDailyInteractions,
  fetchPortalRecentBangers,
} from '@/lib/portal/analytics'
import type { PortalTweet } from '@/lib/portal/types'
import {
  fillDailyDigestCandidates,
  selectDailyDigestBangers,
} from './generation'
import type { DigestCandidate } from './types'

export const MINIMUM_DIGEST_CANDIDATE_POOL = 10

type DigestCandidateSources = {
  fetchDailyInteractions: typeof fetchPortalDailyInteractions
  fetchRecentBangers: typeof fetchPortalRecentBangers
}

const DEFAULT_SOURCES: DigestCandidateSources = {
  fetchDailyInteractions: fetchPortalDailyInteractions,
  fetchRecentBangers: fetchPortalRecentBangers,
}

const tweetIds = (tweets: PortalTweet[]) => new Set(tweets.map(({ id }) => id))

export async function loadDigestCandidates(
  windowEnd: string,
  targetCommunityUsersOnly = false,
  sources: DigestCandidateSources = DEFAULT_SOURCES,
) {
  const [bangers, communityBangers] = await Promise.all([
    sources.fetchRecentBangers(
      50,
      24,
      undefined,
      windowEnd,
      targetCommunityUsersOnly,
    ),
    targetCommunityUsersOnly
      ? Promise.resolve<PortalTweet[]>([])
      : sources.fetchRecentBangers(50, 24, undefined, windowEnd, true),
  ])
  const qualifyingBangers = selectDailyDigestBangers(bangers)
  const needsInteractionFallback =
    qualifyingBangers.length < MINIMUM_DIGEST_CANDIDATE_POOL
  const [interactionRanked, communityInteractions] = needsInteractionFallback
    ? await Promise.all([
        sources.fetchDailyInteractions(
          50,
          24,
          undefined,
          windowEnd,
          targetCommunityUsersOnly,
        ),
        targetCommunityUsersOnly
          ? Promise.resolve<PortalTweet[]>([])
          : sources.fetchDailyInteractions(50, 24, undefined, windowEnd, true),
      ])
    : [[], []]
  const selected = fillDailyDigestCandidates(
    bangers,
    interactionRanked,
    MINIMUM_DIGEST_CANDIDATE_POOL,
  )
  const communityTweetIds = targetCommunityUsersOnly
    ? tweetIds(selected.map(({ tweet }) => tweet))
    : tweetIds([...communityBangers, ...communityInteractions])

  return {
    candidates: selected.map<DigestCandidate>(({ tweet, source }, index) => ({
      tweet,
      source,
      sourceRank: index + 1,
      selected: true,
      communityAuthored: communityTweetIds.has(tweet.id),
    })),
    bangerCount: qualifyingBangers.length,
    communityAuthoredCount: selected.filter(({ tweet }) =>
      communityTweetIds.has(tweet.id),
    ).length,
    fallbackCount: selected.filter(({ source }) => source === 'ca_interactions')
      .length,
  }
}
