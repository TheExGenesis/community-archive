'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { useNavigationAudience } from '@/components/NavigationAudience'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { relativeTime } from '@/components/portal/TweetRow'
import { captureProductAction } from '@/lib/productAnalytics'
import { searchAlertLabel } from '@/lib/searchAlerts/input'
import {
  SEARCH_ALERTS_CHANGED,
  alertsRequest,
  type ClientNotification,
} from './client'

const timeAgo = (iso: string) => {
  const value = relativeTime(iso)
  return /^\d+[mhd]$/.test(value) ? `${value} ago` : value
}

const badgeLabel = (count: number) => (count > 9 ? '9+' : String(count))

/**
 * The header's notifications bell. Renders nothing, and fetches nothing,
 * until the client-side navigation check says this signed-in account may use
 * search alerts, so cached pages stay cached and signed-out visitors never
 * cause a request. Hidden below 768px: measured with a signed-in admin's
 * header, at 640px the bell pushed the nav into overlap; from 768px up it fits.
 */
export function NotificationsBell() {
  const { searchAlerts } = useNavigationAudience()
  if (!searchAlerts) return null
  return <Bell_ />
}

function Bell_() {
  const pathname = usePathname()
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<ClientNotification[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refreshCount = useCallback(() => {
    void alertsRequest<{ unreadCount: number }>('/api/notifications?view=count')
      .then((body) => setUnread(body.unreadCount))
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    refreshCount()
  }, [refreshCount, pathname])

  useEffect(() => {
    window.addEventListener(SEARCH_ALERTS_CHANGED, refreshCount)
    return () => window.removeEventListener(SEARCH_ALERTS_CHANGED, refreshCount)
  }, [refreshCount])

  const load = () => {
    setError(null)
    void alertsRequest<{
      notifications: ClientNotification[]
      unreadCount: number
    }>('/api/notifications')
      .then((body) => {
        setItems(body.notifications)
        setUnread(body.unreadCount)
      })
      .catch((err: Error) => setError(err.message))
  }

  const markAllRead = () => {
    void alertsRequest('/api/notifications/read', {
      method: 'POST',
      body: JSON.stringify({ all: true }),
    }).then(() => {
      setUnread(0)
      setItems(
        (current) =>
          current?.map((item) => ({
            ...item,
            readAt: item.readAt ?? new Date().toISOString(),
          })) ?? null,
      )
    })
  }

  const unreadItems = items?.filter((item) => !item.readAt) ?? []
  const earlier = items?.filter((item) => item.readAt).slice(0, 5) ?? []

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          captureProductAction('search_alerts', 'notifications_opened')
          load()
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'
          }
          title="Notifications"
          className="relative hidden h-10 w-10 items-center justify-center rounded-md border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 md:inline-flex"
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span
              aria-hidden
              className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold leading-none text-brand-foreground ring-2 ring-background"
            >
              {badgeLabel(unread)}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[22rem] rounded-xl p-0 shadow-lg shadow-black/5 dark:shadow-black/40"
      >
        <div className="flex items-center justify-between px-4 pb-2 pt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Search alerts
          </p>
          {unread > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="text-xs font-semibold text-brand hover:text-brand-deep"
            >
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-[26rem] overflow-y-auto px-2 pb-2">
          {error && (
            <p role="alert" className="px-2 py-3 text-sm text-destructive">
              {error}
            </p>
          )}
          {!items && !error && (
            <ul aria-hidden className="space-y-1 p-1">
              {[0, 1].map((i) => (
                <li
                  key={i}
                  className="h-12 animate-pulse rounded-lg bg-muted"
                />
              ))}
            </ul>
          )}
          {items && unreadItems.length === 0 && (
            <p className="px-2 py-4 text-sm text-muted-foreground">
              No new matches. Alerts are checked every hour.
            </p>
          )}
          {unreadItems.length > 0 && (
            <ul className="space-y-0.5">
              {unreadItems.map((item) => (
                <NotificationRow
                  key={item.id}
                  item={item}
                  onOpen={() => setOpen(false)}
                />
              ))}
            </ul>
          )}
          {earlier.length > 0 && (
            <>
              <p className="px-2 pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Earlier
              </p>
              <ul className="space-y-0.5">
                {earlier.map((item) => (
                  <NotificationRow
                    key={item.id}
                    item={item}
                    onOpen={() => setOpen(false)}
                  />
                ))}
              </ul>
            </>
          )}
        </div>
        <div className="border-t border-border px-4 py-2.5">
          <Link
            href="/settings#search-alerts"
            onClick={() => setOpen(false)}
            className="text-[13px] font-semibold text-brand hover:text-brand-deep"
          >
            Manage search alerts &rarr;
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function NotificationRow({
  item,
  onOpen,
}: {
  item: ClientNotification
  onOpen: () => void
}) {
  const unread = !item.readAt
  return (
    <li>
      <Link
        href={`/notifications/${item.id}`}
        onClick={() => {
          captureProductAction('search_alerts', 'notification_opened')
          onOpen()
        }}
        className="flex items-start gap-3 rounded-lg p-2.5 outline-none transition-colors hover:bg-brand/5 focus-visible:bg-brand/5 focus-visible:ring-2 focus-visible:ring-brand/60"
      >
        <span
          aria-hidden
          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${unread ? 'bg-brand' : 'bg-transparent'}`}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold leading-tight text-foreground">
            {searchAlertLabel(item)}
          </span>
          <span className="mt-1 block text-[12.5px] leading-snug text-muted-foreground">
            {item.count.toLocaleString('en-US')} new{' '}
            {item.count === 1 ? 'match' : 'matches'} · {timeAgo(item.updatedAt)}
          </span>
        </span>
      </Link>
    </li>
  )
}
