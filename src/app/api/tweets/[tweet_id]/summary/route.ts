import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { browsingAuthError } from '@/lib/browsingAuth'
import { loadTweetPage } from '@/lib/tweetSummary/loadTweetPage'
import { getTweetPageSummary } from '@/lib/tweetSummary/store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Generation shares the page's former budget; the cached page never waits.
export const maxDuration = 30

const headers = { 'Cache-Control': 'private, no-store' }

/**
 * Generates a permalink's summary for a signed-in visitor. The permalink page
 * is cached for everyone, so the first signed-in visit asks here instead of
 * rendering the generation inline, and the page is refreshed once a result
 * is stored so later visitors read it without asking.
 */
export async function POST(
  _request: Request,
  { params }: { params: { tweet_id: string } },
) {
  const denied = await browsingAuthError()
  if (denied) return denied

  const tweetId = params.tweet_id
  if (!/^\d{1,20}$/.test(tweetId)) {
    return NextResponse.json({ error: 'Invalid tweet id' }, { status: 400, headers })
  }

  const page = await loadTweetPage(tweetId)
  if (!page) {
    return NextResponse.json({ error: 'Not found' }, { status: 404, headers })
  }
  if (!page.summaryMissing) {
    return NextResponse.json({ summary: page.summary }, { headers })
  }

  const summary = await getTweetPageSummary(page.subject, true)
  // Whatever the outcome, the stored row changed; the next render shows it
  // and stops asking.
  revalidatePath(`/tweets/${tweetId}`)
  return NextResponse.json({ summary }, { headers })
}
