import { browsingAuthError } from '@/lib/browsingAuth'
import { NextRequest, NextResponse } from 'next/server'
import { reportApiError } from '@/lib/observability/apiError'

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
    return reportApiError({
      request,
      route: '/api/user-directory',
      status: 502,
      message: 'The user directory is temporarily unavailable',
      upstream: 'gateway',
      error,
    })
  }
}
