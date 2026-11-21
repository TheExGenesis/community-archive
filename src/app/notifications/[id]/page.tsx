import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { BellRing } from 'lucide-react'
import { loginHref } from '@/lib/authRedirect'
import { getCurrentUser } from '@/lib/portal/auth'
import { canUseSearchAlertsUser } from '@/lib/searchAlerts/access'
import { fetchTweetCards } from '@/lib/searchAlerts/gateway'
import {
  searchAlertLabel,
  searchAlertSearchHref,
} from '@/lib/searchAlerts/input'
import { getNotification, listAlertMatches } from '@/lib/searchAlerts/store'
import type { PortalTweet } from '@/lib/portal/types'
import { AlertMatches, MarkNotificationRead } from './AlertMatches'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Search alert matches',
  robots: { index: false, follow: false },
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function SearchAlertMatchesPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) redirect(loginHref(`/notifications/${id}`))
  if (!canUseSearchAlertsUser(user) || !UUID.test(id)) notFound()

  const notification = await getNotification(user.id, id)
  if (!notification) notFound()

  // Tweets first recorded since this unread batch began. They can be older
  // than the alert's last check: many reach the archive days after posting.
  const matches = await listAlertMatches(
    user.id,
    notification.alertId,
    notification.firstMatchedAt,
  )
  let cards = new Map<string, PortalTweet>()
  let cardsFailed = false
  try {
    cards = await fetchTweetCards([
      ...matches.map((match) => match.id),
      ...matches.flatMap((match) => (match.replyToId ? [match.replyToId] : [])),
    ])
  } catch (error) {
    console.error('Search alert matches cards failed:', error)
    cardsFailed = true
  }
  const items = matches.flatMap((match) => {
    const tweet = cards.get(match.id)
    if (!tweet) return []
    return [
      {
        tweet,
        parent: match.replyToId ? (cards.get(match.replyToId) ?? null) : null,
      },
    ]
  })
  // The full search starts on the day of the oldest match shown here.
  const oldestMatch = matches.reduce<string | undefined>(
    (oldest, match) =>
      !oldest || match.createdAt < oldest ? match.createdAt : oldest,
    undefined,
  )
  const searchHref = searchAlertSearchHref(notification, oldestMatch)

  return (
    <main className="min-h-screen bg-background">
      <section className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        {!notification.readAt && <MarkNotificationRead id={notification.id} />}
        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand">
          <BellRing className="h-3 w-3" aria-hidden />
          Search alert
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {searchAlertLabel(notification)}
        </h1>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">
          {notification.count.toLocaleString('en-US')} new{' '}
          {notification.count === 1 ? 'match' : 'matches'}.{' '}
          <Link href={searchHref} className="font-semibold text-brand">
            Open the full search
          </Link>{' '}
          ·{' '}
          <Link
            href="/settings#search-alerts"
            className="font-semibold text-brand"
          >
            Manage alerts
          </Link>
        </p>

        <div className="mt-6">
          {cardsFailed ? (
            <p
              role="alert"
              className="rounded-lg border border-border bg-card px-4 py-6 text-sm text-muted-foreground"
            >
              The matching posts could not be loaded right now.{' '}
              <Link href={searchHref} className="font-semibold text-brand">
                Open the search
              </Link>{' '}
              instead.
            </p>
          ) : items.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border bg-card px-4 py-6 text-sm text-muted-foreground">
              These matches are no longer in the archive.
            </p>
          ) : (
            <AlertMatches
              items={items}
              highlightQuery={notification.query}
              returnTo={`/notifications/${notification.id}`}
            />
          )}
          {notification.count > items.length && items.length > 0 && (
            <p className="mt-4 text-sm text-muted-foreground">
              Showing the newest {items.length}.{' '}
              <Link href={searchHref} className="font-semibold text-brand">
                See every match in search
              </Link>
            </p>
          )}
        </div>
      </section>
    </main>
  )
}
