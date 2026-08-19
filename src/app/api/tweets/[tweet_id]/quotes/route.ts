import { NextRequest, NextResponse } from 'next/server'
import { getQuotingTweetsPage } from '@/lib/quotingTweets'
import { createServerClient } from '@/utils/supabase'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function boundedInteger(
  value: string | null,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === null) return fallback
  if (!/^\d+$/.test(value)) throw new Error('Invalid quote pagination')
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error('Invalid quote pagination')
  }
  return parsed
}

export async function GET(
  request: NextRequest,
  { params }: { params: { tweet_id: string } },
) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(cookieStore)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Log in to see archived quotes' },
        {
          status: 401,
          headers: { 'Cache-Control': 'private, no-store' },
        },
      )
    }

    if (!/^\d{1,20}$/.test(params.tweet_id)) {
      return NextResponse.json({ error: 'Tweet not found' }, { status: 404 })
    }
    const searchParams = new URL(request.url).searchParams
    const offset = boundedInteger(searchParams.get('offset'), 0, 0, 5_000)
    const limit = boundedInteger(searchParams.get('limit'), 12, 1, 50)
    return NextResponse.json(
      await getQuotingTweetsPage(params.tweet_id, offset, limit),
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    const invalid = message === 'Invalid quote pagination'
    if (!invalid) console.error('Quote-post pagination failed:', error)
    return NextResponse.json(
      {
        error: invalid
          ? message
          : 'Archived quotes are temporarily unavailable',
      },
      { status: invalid ? 400 : 502 },
    )
  }
}
