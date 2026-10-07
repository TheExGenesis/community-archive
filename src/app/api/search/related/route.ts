import { NextRequest, NextResponse } from 'next/server'
import {
  searchRelatedDigestStories,
  searchRelatedStrands,
} from '@/lib/search/relatedContent'

export const dynamic = 'force-dynamic'
export const maxDuration = 30
const headers = { 'Cache-Control': 'private, no-store' }

// Strands and digest stories are requested separately so a slow strand
// consent check never holds back digest matches.
export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get('q') ?? '').trim()
  const type = request.nextUrl.searchParams.get('type')
  if (
    query.length < 2 ||
    query.length > 120 ||
    (type !== 'strands' && type !== 'digest')
  )
    return NextResponse.json(
      { error: 'Invalid search or type' },
      { status: 400, headers },
    )
  try {
    return NextResponse.json(
      type === 'strands'
        ? await searchRelatedStrands(query)
        : await searchRelatedDigestStories(query),
      { headers },
    )
  } catch (error) {
    console.error(`Related ${type} search failed:`, error)
    return NextResponse.json(
      { error: 'Related pages could not load.' },
      { status: 503, headers },
    )
  }
}
