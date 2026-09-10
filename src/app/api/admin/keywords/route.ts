import { NextResponse } from 'next/server'
import { checkIsAdmin } from '@/app/admin/data'
import { fetchAnalyticsGatewayJson } from '@/lib/clickhouseGateway'
import { parseKeywordLab } from '@/lib/keywordLab'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' }

export async function GET(request: Request) {
  if (!(await checkIsAdmin()))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers })
  const days = new URL(request.url).searchParams.get('days') ?? '7'
  if (days !== '1' && days !== '7')
    return NextResponse.json(
      { error: 'days must be 1 or 7' },
      { status: 400, headers },
    )
  try {
    const result = parseKeywordLab(
      await fetchAnalyticsGatewayJson(
        ['keyword-lab'],
        new URLSearchParams({ days }),
        { timeoutMs: 60_000 },
      ),
    )
    if (result.datasets[0].days !== Number(days))
      throw new Error('Unexpected keyword window')
    return NextResponse.json(result, { headers })
  } catch {
    return NextResponse.json(
      { error: 'Live keyword data is unavailable. Please retry.' },
      { status: 503, headers },
    )
  }
}
