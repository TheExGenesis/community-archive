import { browsingAuthError } from '@/lib/browsingAuth'
import { NextRequest, NextResponse } from 'next/server'

import { getUserDirectoryPage } from '@/lib/userDirectory'

export const dynamic = 'force-dynamic'
export const maxDuration = 15

export async function GET(request: NextRequest) {
  const authError = await browsingAuthError()
  if (authError) return authError

  try {
    const page = await getUserDirectoryPage(new URL(request.url).searchParams)
    return NextResponse.json(page, {
      headers: {
        'Cache-Control': 'private, no-store',
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
