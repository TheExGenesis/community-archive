import { NextResponse } from 'next/server'
import {
  requireOpportunityUser,
  loadBulletinBoardState,
} from '@/lib/bulletin/data'
import { fetchAnalyticsGatewayJson } from '@/lib/clickhouseGateway'
import { fetchClickHouseTweetPageData } from '@/lib/clickhouseTweetPage'
import type { PortalTweet } from '@/lib/portal/types'
import type { TweetData } from '@/lib/tweets/types'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }
function card(tweet: TweetData): PortalTweet {
  const mapMedia = (items: TweetData['media'] | undefined) =>
    (items || []).map((m) => ({
      url: m.media_url,
      type: m.media_type,
      width: m.width,
      height: m.height,
    }))
  const q = tweet.quoted_tweet
  return {
    id: tweet.tweet_id,
    accountId: tweet.account_id,
    username: tweet.username,
    name: tweet.account_display_name,
    avatar: tweet.avatar_media_url || null,
    text: tweet.full_text,
    createdAt: tweet.created_at,
    observedAt: tweet.created_at,
    likes: tweet.favorite_count || 0,
    rts: tweet.retweet_count || 0,
    media: mapMedia(tweet.media),
    quotedTweet: q
      ? {
          id: q.tweet_id,
          accountId: q.account_id,
          username: q.username,
          name: q.account_display_name,
          avatar: q.avatar_media_url || null,
          text: q.full_text,
          createdAt: q.created_at,
          likes: q.favorite_count || 0,
          rts: q.retweet_count || 0,
          media: mapMedia(q.media),
          isDeleted: q.is_deleted,
        }
      : undefined,
  }
}
export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  await requireOpportunityUser()
  if (!/^\d{1,20}$/.test(params.id))
    return NextResponse.json(
      { error: 'Invalid tweet' },
      { status: 400, headers },
    )
  try {
    // These reads are independent; validate all results before returning content.
    const [{ notices, allowedAccounts }, current, result] = await Promise.all([
      loadBulletinBoardState(),
      fetchAnalyticsGatewayJson<{
        data: Array<{
          tweet_id: string
          account_id: string
          content_hash: string
          reply_to_tweet_id: string | null
          retweet: boolean
          full_text: string
        }>
      }>(['bulletin-sources'], new URLSearchParams({ ids: params.id })),
      fetchClickHouseTweetPageData(params.id, (path, params) =>
        fetchAnalyticsGatewayJson(path, params),
      ),
    ])
    const notice = notices.find((n) => n.tweet_id === params.id)
    if (!notice)
      return NextResponse.json(
        { error: 'Notice unavailable' },
        { status: 404, headers },
      )
    const source = current.data.find((row) => row.tweet_id === params.id)
    if (
      !source ||
      source.content_hash !== notice.content_hash ||
      source.reply_to_tweet_id ||
      source.retweet ||
      source.full_text.startsWith('RT @')
    )
      throw new Error('Source unavailable')
    if (
      !result ||
      (notice.account_id
        ? result.account_id !== notice.account_id
        : !allowedAccounts?.includes(result.account_id))
    )
      throw new Error('Source unavailable')
    const { createHash } = await import('crypto')
    if (
      createHash('sha256').update(result.full_text).digest('hex') !==
      notice.content_hash
    )
      throw new Error('Source changed')
    return NextResponse.json(card(result), { headers })
  } catch {
    return NextResponse.json(
      { error: 'Original post could not be loaded. Try again.' },
      { status: 503, headers },
    )
  }
}
