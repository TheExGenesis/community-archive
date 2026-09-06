import { NextResponse } from 'next/server'
import {
  isValidSubscriptionEmail,
  maskSubscriptionEmail,
  upsertSubscription,
} from '@/lib/digest/emailSubscriptions'
import { getAuthenticatedAccountId } from '@/lib/authenticatedAccount'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Public endpoint. Single opt-in: submitting an address subscribes it
// immediately. The response never reveals whether an address was already
// subscribed.
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
    return NextResponse.json({
      status: 'subscribed',
      email: maskSubscriptionEmail(subscription.email),
    })
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
}
