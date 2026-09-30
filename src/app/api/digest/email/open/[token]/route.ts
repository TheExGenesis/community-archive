import { NextResponse } from 'next/server'
import { createServerServiceRoleClient } from '@/utils/supabase'

export const dynamic = 'force-dynamic'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const GIF = Uint8Array.from(
  Buffer.from('R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=', 'base64'),
)

export async function GET(
  _request: Request,
  { params }: { params: { token: string } },
) {
  if (UUID_PATTERN.test(params.token)) {
    const { error } = await createServerServiceRoleClient()
      .from('digest_email_sends')
      .update({ opened_at: new Date().toISOString() })
      .eq('open_token', params.token)
      .is('opened_at', null)
    if (error)
      console.error('Digest email open recording failed:', error.message)
  }

  return new NextResponse(GIF, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
