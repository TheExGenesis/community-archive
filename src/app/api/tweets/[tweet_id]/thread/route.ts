import { NextRequest, NextResponse } from 'next/server'
import { fetchClickHouseTweetThreadPageData } from '@/lib/clickhouseTweetPage'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function pageInput(searchParams: URLSearchParams) {
  const limitValue = searchParams.get('limit')
  const limit = limitValue === null ? 12 : Number(limitValue)
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
    throw new Error('Invalid thread pagination')
  }

  const after = searchParams.get('after')
  const afterId = searchParams.get('after_id')
  if (Boolean(after) !== Boolean(afterId)) {
    throw new Error('Invalid thread pagination')
  }
  if (!after || !afterId) return { limit }
  const createdAt = new Date(after)
  if (Number.isNaN(createdAt.getTime()) || !/^\d{1,20}$/.test(afterId)) {
    throw new Error('Invalid thread pagination')
  }
  return {
    limit,
    after: { createdAt: createdAt.toISOString(), tweetId: afterId },
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { tweet_id: string } },
) {
  try {
    if (!/^\d{1,20}$/.test(params.tweet_id)) {
      return NextResponse.json({ error: 'Tweet not found' }, { status: 404 })
    }
    const input = pageInput(new URL(request.url).searchParams)
    const page = await fetchClickHouseTweetThreadPageData(
      params.tweet_id,
      undefined,
      input,
    )
    if (!page) {
      return NextResponse.json({ error: 'Tweet not found' }, { status: 404 })
    }
    return NextResponse.json(
      {
        tweets: page.threadTweets,
        totalCount: page.totalCount,
        nextCursor: page.nextCursor,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    const invalid = message === 'Invalid thread pagination'
    if (!invalid) console.error('Thread pagination failed:', error)
    return NextResponse.json(
      { error: invalid ? message : 'Thread is temporarily unavailable' },
      { status: invalid ? 400 : 502 },
    )
  }
}
