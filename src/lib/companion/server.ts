import 'server-only'
import { cookies } from 'next/headers'
import { createServerClient } from '@/utils/supabase'
import { getCurrentUser } from '@/lib/portal/auth'
import { getPortalBangersPage, enrichPortalTweets } from '@/lib/portal/data'
import {
  fetchPortalTrendSeries,
  fetchPortalTrendEvidence,
} from '@/lib/portal/analytics'
import { getCuratedProfileBangersPage } from '@/lib/profileCuration'
import { resolveProfileCore } from '@/lib/metaTwitter/profile'
import { bangerPortalTweet } from '@/lib/metaTwitter/bangerPortalTweet'
import { getPublishedDigest } from '@/lib/digest/data'
import { getSocialGraphSnapshot } from '@/lib/socialGraph'
import {
  fetchAnalyticsGatewayJson,
  clickHouseSearchGatewayBaseUrl,
  isClickHouseReadsEnabled,
} from '@/lib/clickhouseGateway'
import { compactDigest, compactGraph } from './projections'
import { archiveHref, type ArchiveInput, type ArchiveResult } from './contract'
import type { PortalTweet } from '@/lib/portal/types'

/** Verify the supplied JWT with Auth; a malformed bearer never falls back to cookies. */
export async function companionSignedIn(request: Request): Promise<boolean> {
  const authorization = request.headers.get('authorization')
  if (authorization !== null) {
    if (!/^Bearer \S+$/i.test(authorization) || authorization.length > 8192)
      return false
    const { data, error } = await createServerClient(cookies()).auth.getUser(
      authorization.slice(7),
    )
    return !error && !!data.user && !data.user.is_anonymous
  }
  const user = await getCurrentUser()
  return !!user && !user.is_anonymous
}

type SearchResponse = {
  data: {
    nextOffset: number | null
    tweets: {
      tweetId: string
      username: string | null
      accountDisplayName: string | null
      fullText: string
      createdAt: string
      favoriteCount: string | number
      retweetCount: string | number | null
      media: {
        mediaUrl: string
        mediaType: string
        width?: number
        height?: number
      }[]
    }[]
  }
}

export async function readCompanion(
  input: ArchiveInput,
): Promise<ArchiveResult> {
  const base = { version: 1 as const, href: archiveHref(input) }
  const { feature, q = '', username = '', offset = 0 } = input
  switch (feature) {
    case 'bangers': {
      if (username) {
        const profile = await resolveProfileCore(username)
        if (!profile)
          return {
            ...base,
            feature,
            data: { tweets: [], nextOffset: null },
            explanation: `No public archive profile found for @${username}.`,
          }
        const page = await getCuratedProfileBangersPage(profile.accountId, {
          limit: 6,
          offset,
          sort: 'quotes',
        })
        if (!page.available) throw new Error('Profile bangers unavailable')
        return {
          ...base,
          feature,
          data: {
            tweets: page.tweets.map((t) => bangerPortalTweet(t)),
            nextOffset: page.nextOffset,
          },
          explanation: `@${username}’s profile bangers, with the same ranking and curation as CA.`,
        }
      }
      const page = await getPortalBangersPage({
        limit: 6,
        offset,
        scope: 'all',
        sort: 'quotes',
        query: q,
        period: input.period === 'all' ? undefined : input.period || 'week',
      })
      return {
        ...base,
        feature,
        data: { tweets: page.tweets, nextOffset: page.pagination.nextOffset },
        explanation:
          'Ranked by quotes from archive members, using CA’s bangers service.',
      }
    }
    case 'digest': {
      const data = compactDigest(
        await getPublishedDigest(input.date, { strict: true }),
        q,
        username,
      )
      return {
        ...base,
        feature,
        href: data.date ? `/digest/${data.date}` : base.href,
        data,
        explanation: data.matched
          ? 'Published stories mentioning this topic or author appear first.'
          : 'The published edition. No story directly matched this context.',
      }
    }
    case 'trends': {
      const [series, evidence] = await Promise.all([
        fetchPortalTrendSeries(
          [q],
          new Date(),
          undefined,
          input.granularity || 'month',
        ),
        fetchPortalTrendEvidence([q], { limit: 3, offset: 0, sort: 'newest' }),
      ])
      return {
        ...base,
        feature,
        data: {
          term: q,
          granularity: series.granularity,
          buckets: series.buckets,
          counts: series.series[0]?.tweetsPerBucket || [],
          per100k: series.series[0]?.perBucket || [],
          computedAt: series.computedAt,
          evidence: await enrichPortalTweets(evidence.tweets),
        },
        explanation:
          'Matching posts per 100,000 archived tweets. Archive coverage is not all of Twitter.',
      }
    }
    case 'graph':
      return {
        ...base,
        feature,
        data: compactGraph(await getSocialGraphSnapshot(), username),
        explanation:
          'Recorded mutual replies and quotes. A connection does not imply friendship or agreement.',
      }
    case 'search': {
      if (!isClickHouseReadsEnabled())
        throw new Error('Archive search unavailable')
      const params = new URLSearchParams({
        q,
        mode: q.split(/\s+/).length > 1 ? 'phrase' : 'all',
        limit: '6',
        offset: String(offset),
        exclude_retweets: 'true',
      })
      if (username) params.set('from_user', username)
      const page = await fetchAnalyticsGatewayJson<SearchResponse>(
        ['search'],
        params,
        { baseUrl: clickHouseSearchGatewayBaseUrl(), timeoutMs: 25000 },
      )
      const tweets: PortalTweet[] = page.data.tweets.map((t) => ({
        id: t.tweetId,
        username: t.username || 'unknown_user',
        name: t.accountDisplayName || t.username || 'Unknown',
        text: t.fullText,
        createdAt: t.createdAt,
        likes: Number(t.favoriteCount || 0),
        rts: Number(t.retweetCount || 0),
        avatar: null,
        observedAt: t.createdAt,
        media: (t.media || []).map((m) => ({
          url: m.mediaUrl,
          type: m.mediaType,
          width: m.width,
          height: m.height,
        })),
      }))
      return {
        ...base,
        feature,
        data: {
          tweets: await enrichPortalTweets(tweets),
          nextOffset: page.data.nextOffset,
        },
        explanation:
          'Recent archive text matches. Multiple words are searched as a phrase.',
      }
    }
  }
}
