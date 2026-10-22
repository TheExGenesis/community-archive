import { NextRequest, NextResponse } from 'next/server'
import { canCurateShelf } from '@/lib/shelf/access'
import { findShelfRow, getShelfEchoes } from '@/lib/shelf/data'

export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'private, no-store' }

/**
 * Other members who tweeted about one shelf item, with a tweet from each,
 * loaded when its drawer opens. The item must be visible to the caller:
 * approved, or on a shelf the caller curates.
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
    const echoes = await getShelfEchoes(accountId, found.row.work_key)
    if (echoes.failed)
      return NextResponse.json(
        { error: 'Tweets from other members are unavailable. Try again.' },
        { status: 503, headers: noStore },
      )
    return NextResponse.json(
      { people: echoes.people, tweets: echoes.tweets, total: echoes.total },
      {
        headers: found.isPublic
          ? { 'Cache-Control': 'public, max-age=300, s-maxage=3600' }
          : noStore,
      },
    )
  } catch {
    return NextResponse.json(
      { error: 'Tweets from other members are unavailable. Try again.' },
      { status: 503, headers: noStore },
    )
  }
}
