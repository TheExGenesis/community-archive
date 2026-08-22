import { NextRequest, NextResponse } from 'next/server'

import { getUserDirectoryPage } from '@/lib/userDirectory'
import { enforceBotId } from '@/lib/botIdServer'

export const dynamic = 'force-dynamic'
export const maxDuration = 15

export async function GET(request: NextRequest) {
  const botResponse = await enforceBotId()
  if (botResponse) return botResponse

  try {
    const page = await getUserDirectoryPage(new URL(request.url).searchParams)
    return NextResponse.json(page, {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
      },
    })
  } catch (error) {
    console.error('ClickHouse member-directory request failed:', error)
    return NextResponse.json(
      { error: 'The user directory is temporarily unavailable' },
      {
        status: 502,
        headers: { 'Cache-Control': 'private, no-store' },
      },
    )
  }
}
