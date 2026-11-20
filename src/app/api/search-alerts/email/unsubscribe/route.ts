import { NextResponse } from 'next/server'
import { disableSearchAlertEmailByToken } from '@/lib/searchAlerts/store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const landing = (origin: string, status: string) =>
  new URL(`/settings?alertEmail=${status}#search-alerts`, origin)

async function handleUnsubscribe(request: Request) {
  const url = new URL(request.url)
  const token = url.searchParams.get('token')
  if (!token) return NextResponse.redirect(landing(url.origin, 'invalid'))
  try {
    const known = await disableSearchAlertEmailByToken(token)
    return NextResponse.redirect(
      landing(url.origin, known ? 'unsubscribed' : 'invalid'),
    )
  } catch (error) {
    console.error(
      'Search alert unsubscribe failed:',
      error instanceof Error ? error.message : error,
    )
    return NextResponse.redirect(landing(url.origin, 'error'))
  }
}

export async function GET(request: Request) {
  return handleUnsubscribe(request)
}

// RFC 8058 one-click unsubscribe (List-Unsubscribe-Post) arrives as a POST.
export async function POST(request: Request) {
  return handleUnsubscribe(request)
}
