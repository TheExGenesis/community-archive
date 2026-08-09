import { NextResponse } from 'next/server'
import { checkFrontendHealth } from '@/lib/frontendHealth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const health = await checkFrontendHealth()
  return NextResponse.json(health, {
    status: health.status === 'healthy' ? 200 : 503,
    headers: {
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
}
