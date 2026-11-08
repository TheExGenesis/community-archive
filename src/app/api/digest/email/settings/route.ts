import { NextResponse } from 'next/server'
import { getAuthenticatedAccountId } from '@/lib/authenticatedAccount'
import {
  getSubscriptionForAccount,
  isDigestEmailList,
  maskSubscriptionEmail,
  setListEnabled,
  unsubscribe,
  type DigestEmailSubscription,
} from '@/lib/digest/emailSubscriptions'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const maskEmail = maskSubscriptionEmail

const subscriptionStatus = (subscription: DigestEmailSubscription) => {
  const active = Boolean(
    subscription.confirmedAt && !subscription.unsubscribedAt,
  )
  return {
    id: subscription.id,
    email: maskEmail(subscription.email),
    status: subscription.unsubscribedAt
      ? ('unsubscribed' as const)
      : subscription.confirmedAt
        ? ('subscribed' as const)
        : ('none' as const),
    daily: active && subscription.daily,
    weekly: active && subscription.weekly,
  }
}

export async function GET() {
  const accountId = await getAuthenticatedAccountId()
  if (!accountId) {
    return new NextResponse('Unauthorized', { status: 401 })
  }
  const subscription = await getSubscriptionForAccount(accountId)
  return NextResponse.json(
    subscription ? subscriptionStatus(subscription) : { status: 'none' },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}

// Actions: `unsubscribe` stops every email; `set` turns one list on or off
// for the account's existing subscription. A first subscription goes through
// the regular subscribe endpoint, which needs an address.
export async function POST(request: Request) {
  const accountId = await getAuthenticatedAccountId()
  if (!accountId) {
    return new NextResponse('Unauthorized', { status: 401 })
  }
  let action: unknown
  let subscriptionId: unknown
  let list: unknown
  let enabled: unknown
  try {
    ;({ action, subscriptionId, list, enabled } = await request.json())
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  if (action !== 'unsubscribe' && action !== 'set') {
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  }
  if (
    action === 'set' &&
    (!isDigestEmailList(list) || typeof enabled !== 'boolean')
  ) {
    return NextResponse.json(
      { error: 'Choose a list and whether it is on.' },
      { status: 400 },
    )
  }
  if (
    subscriptionId !== undefined &&
    (typeof subscriptionId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        subscriptionId,
      ))
  ) {
    return NextResponse.json(
      { error: 'Invalid subscription.' },
      { status: 400 },
    )
  }

  const subscription = await getSubscriptionForAccount(
    accountId,
    subscriptionId as string | undefined,
  )
  if (!subscription) {
    return NextResponse.json({ status: 'none' })
  }
  if (action === 'set' && isDigestEmailList(list)) {
    const updated = await setListEnabled(subscription, list, enabled === true)
    return NextResponse.json(subscriptionStatus(updated))
  }
  if (!subscription.unsubscribedAt) {
    await unsubscribe(subscription.token)
  }
  return NextResponse.json({
    email: maskEmail(subscription.email),
    status: 'unsubscribed',
  })
}
