import { NextResponse } from 'next/server'
import { unsubscribe } from '@/lib/digest/emailSubscriptions'

// Weekly links turn off only the weekly list and land on the weekly page.
const landing = (list: string | null) =>
  list === 'weekly' ? '/digest/week' : '/digest'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function handleUnsubscribe(request: Request) {
  const url = new URL(request.url)
  const token = url.searchParams.get('token')
  const list = url.searchParams.get('list')
  const page = landing(list)
  if (!token) {
    return NextResponse.redirect(new URL(`${page}?email=invalid`, url.origin))
  }
  try {
    const known = await unsubscribe(
      token,
      list === 'weekly' ? 'weekly' : undefined,
    )
    return NextResponse.redirect(
      new URL(
        `${page}?email=${known ? 'unsubscribed' : 'invalid'}`,
        url.origin,
      ),
    )
  } catch (error) {
    console.error(
      'Digest unsubscribe failed:',
      error instanceof Error ? error.message : error,
    )
    return NextResponse.redirect(new URL(`${page}?email=error`, url.origin))
  }
}

export async function GET(request: Request) {
  return handleUnsubscribe(request)
}

// RFC 8058 one-click unsubscribe (List-Unsubscribe-Post) arrives as a POST.
export async function POST(request: Request) {
  return handleUnsubscribe(request)
}
