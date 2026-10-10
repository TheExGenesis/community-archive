import { NextRequest, NextResponse } from 'next/server'
import { canCurateShelf } from '@/lib/shelf/access'
import { findShelfRow, getShelfEvidence } from '@/lib/shelf/data'

export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'private, no-store' }

/**
 * Source tweets for one shelf item, hydrated on demand when its drawer opens,
 * so a slow or failed tweet read never blanks the shelf itself.
 */
export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get('account_id') ?? ''
  const key = request.nextUrl.searchParams.get('key') ?? ''
  if (!/^\d{1,20}$/.test(accountId) || !/^[0-9a-f]{32}$/.test(key))
    return NextResponse.json(
      { error: 'Invalid item' },
      { status: 400, headers: noStore },
    )
  try {
    const found = await findShelfRow(accountId, key, () =>
      canCurateShelf(accountId),
    )
    if (!found)
      return NextResponse.json(
        { error: 'Item not found' },
        { status: 404, headers: noStore },
      )
    const evidence = await getShelfEvidence(
      accountId,
      found.row.evidence_tweet_ids ?? [],
    )
    if (evidence.failed)
      return NextResponse.json(
        { error: 'Source tweets are unavailable. Try again.' },
        { status: 503, headers: noStore },
      )
    return NextResponse.json(
      { tweets: evidence.tweets, total: evidence.total },
      {
        headers: found.isPublic
          ? { 'Cache-Control': 'public, max-age=300, s-maxage=3600' }
          : noStore,
      },
    )
  } catch {
    return NextResponse.json(
      { error: 'Source tweets are unavailable. Try again.' },
      { status: 503, headers: noStore },
    )
  }
}
