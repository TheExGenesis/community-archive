import { NextRequest, NextResponse } from 'next/server'
import { parseArchiveInput } from '@/lib/companion/contract'
import { companionSignedIn, readCompanion } from '@/lib/companion/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      Vary: 'Authorization, Cookie',
    },
  })

export async function GET(
  request: NextRequest,
  { params }: { params: { feature: string } },
) {
  let input
  try {
    input = parseArchiveInput(params.feature, request.nextUrl.searchParams)
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Invalid request' },
      400,
    )
  }
  try {
    if (input.feature === 'trends' && !(await companionSignedIn(request)))
      return json(
        { error: 'Sign in to Community Archive to explore trends.' },
        401,
      )
    return json(await readCompanion(input))
  } catch {
    // Avoid leaking upstream bodies, credentials, or browsing queries in errors/logs.
    return json(
      {
        error:
          'This archive view is temporarily unavailable. Please try again.',
      },
      502,
    )
  }
}
