import { NextRequest, NextResponse } from 'next/server'
import { readMapLookup } from '@/lib/hexMap/lookup'
import type { MapPeoplePage } from '@/lib/hexMap/gateway'
import { MAP_VERSION } from '@/lib/hexMap/version'
import { createServerServiceRoleClient } from '@/utils/supabase'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  if (params.get('version') !== MAP_VERSION)
    return NextResponse.json(
      { error: 'Map version changed; reload the page' },
      { status: 409, headers },
    )
  const cells = params.get('cells') || ''
  const offset = params.get('offset') || '0'
  if (
    cells.length > 8000 ||
    !/^\d+(,\d+)*$/.test(cells) ||
    cells.split(',').some((id) => Number(id) >= 1730) ||
    !/^\d{1,5}$/.test(offset) ||
    Number(offset) > 10000
  )
    return NextResponse.json(
      { error: 'Invalid map people page' },
      { status: 400, headers },
    )
  try {
    const result = (await readMapLookup({
      cells,
      offset,
      peoplePage: '1',
    })) as MapPeoplePage
    const people = result.people
    if (people.length && process.env.VERCEL_ENV !== 'preview') {
      const { data, error } = await createServerServiceRoleClient()
        .from('user_directory')
        .select('account_id,avatar_media_url')
        .in(
          'account_id',
          people.map((person) => person.account_id),
        )
      if (error) throw new Error('Member avatars unavailable')
      const avatars = new Map(
        data?.map((row) => [row.account_id, row.avatar_media_url]),
      )
      for (const person of people)
        person.avatar = avatars.get(person.account_id) ?? null
    }
    return NextResponse.json(
      { people, nextOffset: result.nextOffset },
      { headers },
    )
  } catch {
    return NextResponse.json(
      { error: 'People are temporarily unavailable' },
      { status: 503, headers },
    )
  }
}
