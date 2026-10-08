import { NextRequest, NextResponse } from 'next/server'
import { loadConversationMap } from '@/lib/conversation-map/data'
import { findAiStrand, markAiStrand } from '@/lib/conversation-map/strands'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const strand = request.nextUrl.searchParams.get('strand')
  if (strand !== null && strand !== 'ai') {
    return NextResponse.json(
      { error: 'Invalid strand' },
      {
        status: 400,
        headers: { 'Cache-Control': 'private, no-store' },
      },
    )
  }
  const input =
    request.nextUrl.searchParams.get('year') ??
    String(new Date().getUTCFullYear())
  const year = Number(input)
  if (
    !/^\d{4}$/.test(input) ||
    year < 2006 ||
    year > new Date().getUTCFullYear()
  ) {
    return NextResponse.json(
      { error: 'Invalid year' },
      { status: 400, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }
  try {
    const data = await loadConversationMap(year)
    if (strand === 'ai') {
      data.annotations = markAiStrand(
        data.annotations,
        await findAiStrand(year),
      )
      data.strand = 'ai'
    }
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    })
  } catch (error) {
    console.error('Conversation map unavailable:', error)
    return NextResponse.json(
      {
        error: 'The conversation map is temporarily unavailable. Please retry.',
      },
      { status: 502, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }
}
