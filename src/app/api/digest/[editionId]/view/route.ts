import { NextResponse } from 'next/server'
import { createDigestAdminClient } from '@/lib/digest/database'

export const dynamic = 'force-dynamic'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(
  _request: Request,
  { params }: { params: { editionId: string } },
) {
  if (!UUID_PATTERN.test(params.editionId)) {
    return NextResponse.json({ error: 'Edition not found' }, { status: 404 })
  }

  const { data, error } = await createDigestAdminClient().rpc(
    'record_digest_view',
    { p_edition_id: params.editionId },
  )
  if (error) {
    console.error('Digest view increment failed:', error.message)
    return NextResponse.json({ error: 'View unavailable' }, { status: 500 })
  }
  if (typeof data !== 'number') {
    return NextResponse.json({ error: 'Edition not found' }, { status: 404 })
  }
  return NextResponse.json(
    { count: data },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
