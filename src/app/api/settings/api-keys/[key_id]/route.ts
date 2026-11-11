import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/portal/auth'
import { PublicApiKeyError, revokePublicApiKey } from '@/lib/publicApiKeys'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' }

type RouteParams = { key_id: string }

export async function DELETE(
  request: NextRequest,
  { params: paramsPromise }: { params: Promise<RouteParams> },
) {
  const params = await paramsPromise
  if (request.headers.get('origin') !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers })
  }
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in to revoke an API key.' },
      { status: 401, headers },
    )
  }
  try {
    const revoked = await revokePublicApiKey(user.id, params.key_id)
    if (!revoked) {
      return NextResponse.json(
        { error: 'No active key with that ID belongs to your account.' },
        { status: 404, headers },
      )
    }
    return NextResponse.json({ revoked: true }, { headers })
  } catch (error) {
    const status = error instanceof PublicApiKeyError ? error.status : 503
    return NextResponse.json(
      { error: 'API keys are temporarily unavailable.' },
      { status, headers },
    )
  }
}
