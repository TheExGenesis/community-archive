import { NextResponse } from 'next/server'
import {
  digestConfirmUrl,
  digestUnsubscribeUrl,
} from '@/lib/digest/emailLinks'
import {
  isValidSubscriptionEmail,
  upsertSubscription,
} from '@/lib/digest/emailSubscriptions'
import { sendEmail } from '@/lib/email'
import { getAuthenticatedAccountId } from '@/lib/authenticatedAccount'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Public endpoint. The response never reveals whether an address was already
// subscribed — the state difference only shows up in the recipient's inbox.
export async function POST(request: Request) {
  let email: unknown
  try {
    ;({ email } = await request.json())
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  if (typeof email !== 'string' || !isValidSubscriptionEmail(email)) {
    return NextResponse.json(
      { error: 'Please provide a valid email address.' },
      { status: 400 },
    )
  }

  try {
    // Trusted provider identity from the session, when present, links the
    // subscription to the account so settings can manage it.
    const accountId = await getAuthenticatedAccountId()
    const subscription = await upsertSubscription(email, accountId)
    if (!subscription.confirmedAt) {
      const confirmUrl = digestConfirmUrl(subscription.token)
      const result = await sendEmail({
        to: subscription.email,
        subject: 'Confirm your Community Archive Daily Digest subscription',
        html: `
          <div style="margin:0 auto;max-width:600px;padding:24px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
            <h1 style="margin:0 0 16px;font-size:20px;">Confirm your subscription</h1>
            <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">Click the link below to start receiving the Community Archive Daily Digest. If you didn't request this, you can ignore this email — you won't be subscribed.</p>
            <p style="margin:0 0 24px;"><a href="${confirmUrl}" style="color:#1d4ed8;">Confirm subscription</a></p>
            <p style="margin:0;color:#6b7280;font-size:12px;"><a href="${digestUnsubscribeUrl(subscription.token)}" style="color:#6b7280;">Unsubscribe</a></p>
          </div>`,
        text: `Confirm your Community Archive Daily Digest subscription: ${confirmUrl}\n\nIf you didn't request this, ignore this email and you won't be subscribed.`,
      })
      if (!result.ok) {
        console.error('Digest confirmation email failed:', result.error)
        return NextResponse.json(
          { error: 'Could not send the confirmation email. Please try again.' },
          { status: 502 },
        )
      }
    }
  } catch (error) {
    console.error(
      'Digest subscribe failed:',
      error instanceof Error ? error.message : error,
    )
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 },
    )
  }

  return NextResponse.json(
    { status: 'pending', message: 'Check your inbox to confirm.' },
    { status: 202 },
  )
}
