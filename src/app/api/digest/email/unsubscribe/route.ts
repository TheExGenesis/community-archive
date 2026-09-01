import { NextResponse } from 'next/server'
import { unsubscribe } from '@/lib/digest/emailSubscriptions'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function handleUnsubscribe(request: Request) {
  const url = new URL(request.url)
  const token = url.searchParams.get('token')
  if (!token) {
    return NextResponse.redirect(new URL('/digest?email=invalid', url.origin))
  }
  try {
    const known = await unsubscribe(token)
    return NextResponse.redirect(
      new URL(
        known ? '/digest?email=unsubscribed' : '/digest?email=invalid',
        url.origin,
      ),
    )
  } catch (error) {
    console.error(
      'Digest unsubscribe failed:',
      error instanceof Error ? error.message : error,
    )
    return NextResponse.redirect(new URL('/digest?email=error', url.origin))
  }
}

export async function GET(request: Request) {
  return handleUnsubscribe(request)
}

// RFC 8058 one-click unsubscribe (List-Unsubscribe-Post) arrives as a POST.
export async function POST(request: Request) {
  return handleUnsubscribe(request)
}
