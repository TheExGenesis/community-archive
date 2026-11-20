import { NextResponse } from 'next/server'
import { isAuthorizedDigestCronRequest } from '@/lib/digest/cron'
import { digestEmailSiteUrl } from '@/lib/digest/emailLinks'
import { sendEmail } from '@/lib/email'
import {
  searchAlertSettingsUrl,
  searchAlertUnsubscribeUrl,
} from '@/lib/searchAlerts/emailLinks'
import { runSearchAlertEmails } from '@/lib/searchAlerts/emailRun'
import { fetchTweetCards } from '@/lib/searchAlerts/gateway'
import {
  claimSearchAlertEmail,
  completeSearchAlertEmail,
  getUserEmail,
  listSearchAlertEmailUsers,
  loadClaimedMatches,
  releaseSearchAlertEmail,
} from '@/lib/searchAlerts/store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(request: Request) {
  return handleSend(request)
}

export async function POST(request: Request) {
  return handleSend(request)
}

async function handleSend(request: Request) {
  if (!isAuthorizedDigestCronRequest(request)) {
    return new NextResponse('Unauthorized', { status: 401 })
  }
  const result = await runSearchAlertEmails({
    // ~600 ms per send keeps 300 users inside the function's time limit.
    listUsers: () => listSearchAlertEmailUsers(300),
    claim: claimSearchAlertEmail,
    load: loadClaimedMatches,
    complete: completeSearchAlertEmail,
    release: releaseSearchAlertEmail,
    userEmail: getUserEmail,
    tweetCards: (ids) => fetchTweetCards(ids),
    send: sendEmail,
    links: {
      siteUrl: digestEmailSiteUrl(),
      settingsUrl: searchAlertSettingsUrl(),
      unsubscribeUrl: searchAlertUnsubscribeUrl,
    },
  })
  return NextResponse.json(result)
}
