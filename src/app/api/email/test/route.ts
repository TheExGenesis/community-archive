import { NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Operator-only smoke test for the Resend integration. Reuses the cron bearer
// secret so it is never callable by browsers or anonymous clients.
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (
    !cronSecret ||
    request.headers.get('authorization') !== `Bearer ${cronSecret}`
  ) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  let to: unknown
  try {
    ;({ to } = await request.json())
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  if (typeof to !== 'string' || !to.includes('@')) {
    return NextResponse.json(
      { error: 'Body must include a "to" email address.' },
      { status: 400 },
    )
  }

  const result = await sendEmail({
    to,
    subject: 'Community Archive email test',
    html: '<p>This is a test email from the Community Archive Resend integration.</p>',
    text: 'This is a test email from the Community Archive Resend integration.',
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }
  return NextResponse.json({ id: result.id }, { status: 200 })
}
