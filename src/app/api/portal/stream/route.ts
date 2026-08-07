import { NextResponse } from 'next/server'
import { getPortalStream } from '@/lib/portal/data'

export const revalidate = 0

export async function GET() {
  const tweets = await getPortalStream(30)
  return NextResponse.json(
    { tweets },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
      },
    },
  )
}
