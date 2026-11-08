import { NextResponse } from 'next/server'
import { isAuthorizedDigestCronRequest } from '@/lib/digest/cron'
import {
  digestEmailSiteUrl,
  digestUnsubscribeUrl,
} from '@/lib/digest/emailLinks'
import {
  listUnsentWeeklyRecipients,
  recordWeeklySend,
} from '@/lib/digest/emailSubscriptions'
import {
  parseWeeklyDigestContent,
  type WeeklyDigestEdition,
} from '@/lib/digest/weeklyData'
import { renderWeeklyDigestEmail } from '@/lib/digest/weeklyEmailTemplate'
import { sendEmail } from '@/lib/email'
import { createServerServiceRoleClient } from '@/utils/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

// Resend allows ~2 requests/second; stay under it.
const SEND_INTERVAL_MS = 600
// The scheduled send only mails a week that ended recently, so a late or
// missing edition never sends an old week to new subscribers.
const MAX_AGE_DAYS = 8
const WEEK_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function loadPublishedWeek(
  weekStart?: string,
): Promise<WeeklyDigestEdition | null> {
  let query = createServerServiceRoleClient()
    .from('digest_weekly_editions')
    .select('id, week_start, published_at, content')
    .eq('status', 'published')
    .order('week_start', { ascending: false })
  if (weekStart) query = query.eq('week_start', weekStart)
  const { data, error } = await query.limit(1).maybeSingle()
  if (error) throw error
  const content = data ? parseWeeklyDigestContent(data.content) : null
  return data && content
    ? {
        id: data.id,
        weekStart: data.week_start,
        publishedAt: data.published_at,
        content,
      }
    : null
}

/** Days between the end of the edition's week and now. */
export const weekAgeDays = (weekEnd: string, now = Date.now()) =>
  (now - Date.parse(`${weekEnd}T23:59:59Z`)) / 86_400_000

// Vercel's scheduler calls cron paths with GET (Mondays, after the edition is
// due). Operators can POST {weekStart} to send a specific published week.
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

  let requestedWeek: unknown
  try {
    const body = request.method === 'POST' ? await request.clone().text() : ''
    if (body) ({ weekStart: requestedWeek } = JSON.parse(body))
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  if (
    requestedWeek !== undefined &&
    (typeof requestedWeek !== 'string' || !WEEK_PATTERN.test(requestedWeek))
  ) {
    return NextResponse.json(
      { error: 'weekStart must be a YYYY-MM-DD Monday.' },
      { status: 400 },
    )
  }

  const edition = await loadPublishedWeek(requestedWeek)
  if (!edition) {
    return NextResponse.json(
      { error: 'No published weekly edition found.' },
      { status: 404 },
    )
  }
  if (!requestedWeek && weekAgeDays(edition.content.weekEnd) > MAX_AGE_DAYS) {
    return NextResponse.json({
      weekStart: edition.weekStart,
      skipped: 'latest published week is too old to send',
    })
  }

  const recipients = await listUnsentWeeklyRecipients(edition.id)
  const siteUrl = digestEmailSiteUrl()
  let sent = 0
  const failures: string[] = []

  for (let index = 0; index < recipients.length; index += 1) {
    const recipient = recipients[index]
    if (index > 0) await sleep(SEND_INTERVAL_MS)
    const unsubscribeUrl = digestUnsubscribeUrl(recipient.token, 'weekly')
    const rendered = renderWeeklyDigestEmail(edition, {
      siteUrl,
      unsubscribeUrl,
    })
    const result = await sendEmail({
      to: recipient.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    })
    if (!result.ok) {
      console.error(
        `Weekly digest email to subscription ${recipient.id} failed:`,
        result.error,
      )
      failures.push(recipient.id)
      continue
    }
    await recordWeeklySend(edition.id, recipient.id, result.id)
    sent += 1
  }

  return NextResponse.json({
    weekStart: edition.weekStart,
    editionId: edition.id,
    recipients: recipients.length,
    sent,
    failed: failures.length,
  })
}
