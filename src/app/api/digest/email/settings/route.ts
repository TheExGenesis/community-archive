import { NextResponse } from 'next/server'
import { getAuthenticatedAccountId } from '@/lib/authenticatedAccount'
import {
  getSubscriptionForAccount,
  maskSubscriptionEmail,
  unsubscribe,
} from '@/lib/digest/emailSubscriptions'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const maskEmail = maskSubscriptionEmail

const subscriptionStatus = (subscription: {
  email: string
  unsubscribedAt: string | null
}) => ({
  email: maskEmail(subscription.email),
  status: subscription.unsubscribedAt
    ? ('unsubscribed' as const)
    : ('subscribed' as const),
})

export async function GET() {
  const accountId = await getAuthenticatedAccountId()
  if (!accountId) {
    return new NextResponse('Unauthorized', { status: 401 })
  }
  const subscription = await getSubscriptionForAccount(accountId)
  return NextResponse.json(
    subscription ? subscriptionStatus(subscription) : { status: 'none' },
  )
}

// The only settings action is unsubscribe; re-subscribing goes through the
// regular subscribe endpoint.
export async function POST(request: Request) {
  const accountId = await getAuthenticatedAccountId()
  if (!accountId) {
    return new NextResponse('Unauthorized', { status: 401 })
  }
  let action: unknown
  try {
    ;({ action } = await request.json())
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  if (action !== 'unsubscribe') {
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  }

  const subscription = await getSubscriptionForAccount(accountId)
  if (!subscription) {
    return NextResponse.json({ status: 'none' })
  }
  if (!subscription.unsubscribedAt) {
    await unsubscribe(subscription.token)
  }
  return NextResponse.json({
    email: maskEmail(subscription.email),
    status: 'unsubscribed',
  })
}
