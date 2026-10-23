import { MAP_VERSION } from '@/lib/hexMap/version'
import { NextRequest, NextResponse } from 'next/server'
import { readMapLookup } from '@/lib/hexMap/lookup'
import { createServerServiceRoleClient } from '@/utils/supabase'
import { sampleFeaturedArchives } from '@/lib/featuredArchives'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }
export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get('version') !== MAP_VERSION)
    return NextResponse.json(
      { error: 'Map version changed; reload the page' },
      { status: 409, headers },
    )
  const anchor = request.nextUrl.searchParams.get('name') || '',
    cells = request.nextUrl.searchParams.get('cells') || ''
  if (
    (anchor && !/^\w{1,15}$/.test(anchor)) ||
    cells.length > 8000 ||
    !/^\d*(,\d+)*$/.test(cells)
  )
    return NextResponse.json(
      { error: 'Invalid map lookup' },
      { status: 400, headers },
    )
  try {
    const names = anchor
      ? [anchor]
      : cells
        ? []
        : sampleFeaturedArchives()
            .slice(0, 6)
            .map((p) => p.username)
    const result = await readMapLookup({ names: names.join(','), cells })
    const people = result.people
    if (cells && people.length && process.env.VERCEL_ENV !== 'preview') {
      const { data, error } = await createServerServiceRoleClient()
        .from('user_directory')
        .select('account_id,avatar_media_url')
        .in(
          'account_id',
          people.slice(0, 6).map((p) => p.account_id),
        )
      if (error) throw new Error('Member avatars unavailable')
      for (const person of people)
        person.avatar =
          data?.find((r) => r.account_id === person.account_id)
            ?.avatar_media_url ?? null
    }
    return NextResponse.json({ ...result, people }, { headers })
  } catch {
    return NextResponse.json(
      { error: 'Map locations are temporarily unavailable' },
      { status: 503, headers },
    )
  }
}
