import { NextResponse } from 'next/server'
import { confirmSubscription } from '@/lib/digest/emailSubscriptions'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const token = url.searchParams.get('token')
  if (!token) {
    return NextResponse.redirect(new URL('/digest?email=invalid', url.origin))
  }
  try {
    const subscription = await confirmSubscription(token)
    return NextResponse.redirect(
      new URL(
        subscription ? '/digest?email=confirmed' : '/digest?email=invalid',
        url.origin,
      ),
    )
  } catch (error) {
    console.error(
      'Digest confirm failed:',
      error instanceof Error ? error.message : error,
    )
    return NextResponse.redirect(new URL('/digest?email=error', url.origin))
  }
}
