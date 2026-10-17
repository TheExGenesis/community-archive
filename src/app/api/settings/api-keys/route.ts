import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/portal/auth'
import {
  createPublicApiKey,
  listPublicApiKeys,
  normalizeKeyLabel,
  PublicApiKeyError,
} from '@/lib/publicApiKeys'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' }

function failure(error: unknown) {
  if (error instanceof PublicApiKeyError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status, headers },
    )
  }
  return NextResponse.json(
    { error: 'API keys are temporarily unavailable.' },
    { status: 503, headers },
  )
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in to manage API keys.' },
      { status: 401, headers },
    )
  }
  try {
    return NextResponse.json(
      { keys: await listPublicApiKeys(user.id) },
      { headers },
    )
  } catch (error) {
    return failure(error)
  }
}

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers })
  }
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in to create an API key.' },
      { status: 401, headers },
    )
  }
  try {
    const body = (await request.json().catch(() => ({}))) as {
      label?: unknown
    }
    const created = await createPublicApiKey(
      user,
      normalizeKeyLabel(body.label),
    )
    return NextResponse.json({ key: created }, { status: 201, headers })
  } catch (error) {
    return failure(error)
  }
}
