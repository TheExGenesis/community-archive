import { NextResponse } from 'next/server'
import { mapDigestEdition } from '@/lib/digest/data'
import { isAuthorizedDigestCronRequest } from '@/lib/digest/cron'
import {
  digestEmailSiteUrl,
  digestUnsubscribeUrl,
} from '@/lib/digest/emailLinks'
import {
  listUnsentRecipients,
  recordSend,
} from '@/lib/digest/emailSubscriptions'
import { renderDigestEmail } from '@/lib/digest/emailTemplate'
import { sendEmail } from '@/lib/email'
import { createServerServiceRoleClient } from '@/utils/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

// Resend allows ~2 requests/second; stay under it.
const SEND_INTERVAL_MS = 600

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function loadPublishedEdition(digestDate?: string) {
  const admin = createServerServiceRoleClient()
  let query = admin
    .from('digest_editions')
    .select('*')
    .eq('status', 'published')
    .order('version', { ascending: false })
  query = digestDate
    ? query.eq('digest_date', digestDate)
    : query.order('digest_date', { ascending: false })
  const { data, error } = await query.limit(1).maybeSingle()
  if (error) throw error
  return data ? mapDigestEdition(data) : null
}

// Vercel's scheduler calls cron paths with GET; operators can POST a specific
// {digestDate}. Both send the latest published edition by default.
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

  let requestedDate: unknown
  try {
    const body = request.method === 'POST' ? await request.clone().text() : ''
    if (body) ({ digestDate: requestedDate } = JSON.parse(body))
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  if (requestedDate !== undefined && typeof requestedDate !== 'string') {
    return NextResponse.json(
      { error: 'digestDate must be a YYYY-MM-DD string.' },
      { status: 400 },
    )
  }

  const edition = await loadPublishedEdition(requestedDate)
  if (!edition) {
    return NextResponse.json(
      { error: 'No published digest edition found.' },
      { status: 404 },
    )
  }

  const recipients = await listUnsentRecipients(edition.id)
  const siteUrl = digestEmailSiteUrl()
  let sent = 0
  const failures: string[] = []

  for (let index = 0; index < recipients.length; index += 1) {
    const recipient = recipients[index]
    if (index > 0) await sleep(SEND_INTERVAL_MS)
    const unsubscribeUrl = digestUnsubscribeUrl(recipient.token)
    const rendered = renderDigestEmail(edition, { siteUrl, unsubscribeUrl })
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
        `Digest email to subscription ${recipient.id} failed:`,
        result.error,
      )
      failures.push(recipient.id)
      continue
    }
    await recordSend(edition.id, recipient.id, result.id)
    sent += 1
  }

  return NextResponse.json({
    digestDate: edition.digestDate,
    editionId: edition.id,
    recipients: recipients.length,
    sent,
    failed: failures.length,
  })
}
