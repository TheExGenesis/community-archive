import { NextRequest, NextResponse } from 'next/server'
import {
  isVerifierAuthorized,
  PUBLIC_API_KEY_ID_PATTERN,
  PUBLIC_API_KEY_SHA256_PATTERN,
  verifyPublicApiKey,
} from '@/lib/publicApiKeys'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }

/**
 * Server-to-server key resolution for the ClickHouse query gateway. The
 * gateway sends the public key ID and the SHA-256 of the presented key, never
 * the key itself, and caches a valid answer for at most two minutes.
 */
export async function POST(request: NextRequest) {
  if (!isVerifierAuthorized(request.headers.get('authorization'))) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers },
    )
  }
  const body = (await request.json().catch(() => null)) as {
    key_id?: unknown
    key_sha256?: unknown
  } | null
  const keyId = typeof body?.key_id === 'string' ? body.key_id : ''
  const keySha256 = typeof body?.key_sha256 === 'string' ? body.key_sha256 : ''
  if (
    !PUBLIC_API_KEY_ID_PATTERN.test(keyId) ||
    !PUBLIC_API_KEY_SHA256_PATTERN.test(keySha256)
  ) {
    return NextResponse.json({ valid: false }, { headers })
  }
  try {
    return NextResponse.json(await verifyPublicApiKey(keyId, keySha256), {
      headers,
    })
  } catch {
    return NextResponse.json(
      { error: 'Key verification is temporarily unavailable.' },
      { status: 503, headers },
    )
  }
}
