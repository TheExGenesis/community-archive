'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { BellPlus, BellRing } from 'lucide-react'
import { useNavigationAudience } from '@/components/NavigationAudience'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { captureProductAction } from '@/lib/productAnalytics'
import {
  defaultSearchAlertMode,
  normalizeSearchAlertFromUser,
  normalizeSearchAlertQuery,
  searchAlertLabel,
} from '@/lib/searchAlerts/input'
import {
  alertsRequest,
  announceSearchAlertsChanged,
  type ClientSearchAlert,
} from './client'
import { ToggleSwitch } from './ToggleSwitch'

const sameSearch = (
  alert: ClientSearchAlert,
  query: string,
  fromUser: string | null,
) =>
  alert.query.toLowerCase() === query.toLowerCase() &&
  alert.mode === defaultSearchAlertMode(query) &&
  (alert.fromUser ?? null) === fromUser

/**
 * "Create alert" for the current /search query. Shown only to accounts that
 * may use search alerts; the navigation check that decides it already ran.
 */
export function CreateSearchAlert({
  query: rawQuery,
  fromUser: rawFromUser,
  className,
}: {
  query: string
  fromUser?: string
  /** Applied to a wrapper only when the control renders. */
  className?: string
}) {
  const { searchAlerts } = useNavigationAudience()
  const query = normalizeSearchAlertQuery(rawQuery)
  if (!searchAlerts || !query) return null
  return (
    <div className={className}>
      <CreateSearchAlertControl
        key={`${query}|${rawFromUser ?? ''}`}
        query={query}
        fromUser={normalizeSearchAlertFromUser(rawFromUser)}
      />
    </div>
  )
}

function CreateSearchAlertControl({
  query,
  fromUser,
}: {
  query: string
  fromUser: string | null
}) {
  const [existing, setExisting] = useState<ClientSearchAlert | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void alertsRequest<{ alerts: ClientSearchAlert[] }>('/api/search-alerts')
      .then((body) => {
        if (!active) return
        setExisting(
          body.alerts.find((alert) => sameSearch(alert, query, fromUser)) ??
            null,
        )
      })
      .catch(() => undefined)
      .finally(() => active && setLoaded(true))
    return () => {
      active = false
    }
  }, [query, fromUser])

  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      const body = await alertsRequest<{ alert: ClientSearchAlert }>(
        '/api/search-alerts',
        {
          method: 'POST',
          body: JSON.stringify({ query, fromUser, emailEnabled: email }),
        },
      )
      captureProductAction('search_alerts', 'alert_created')
      setExisting(body.alert)
      setOpen(false)
      announceSearchAlertsChanged()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!loaded) return null

  if (existing) {
    return (
      <div className="inline-flex items-center gap-2 rounded-md border border-brand/30 bg-brand/5 px-3 py-1.5 text-sm">
        <BellRing className="h-4 w-4 text-brand" aria-hidden />
        <span className="font-medium text-foreground">Alert on</span>
        <span className="text-muted-foreground">
          {existing.emailEnabled ? '· in-site and daily email' : '· in-site'}
        </span>
        <Link
          href="/settings#search-alerts"
          className="ml-1 font-semibold text-brand hover:text-brand-deep"
        >
          Manage
        </Link>
      </div>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
        >
          <BellPlus className="h-4 w-4" aria-hidden />
          Create alert
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 rounded-xl p-4">
        <p className="text-sm font-semibold text-foreground">
          Alert me about {searchAlertLabel({ query, fromUser })}
        </p>
        <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
          New matching posts show up under the bell. Alerts are checked every
          hour.
        </p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <span>
            <span className="block text-sm font-medium">Daily email</span>
            <span className="block text-xs text-muted-foreground">
              One roll-up a day, only when there is something new.
            </span>
          </span>
          <ToggleSwitch
            checked={email}
            label="Daily email"
            onChange={setEmail}
            disabled={busy}
          />
        </div>
        {error && (
          <p role="alert" className="mt-3 text-[13px] text-destructive">
            {error}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void create()}
            disabled={busy}
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-brand-foreground transition-colors hover:bg-brand/90 disabled:opacity-60"
          >
            {busy ? 'Saving…' : 'Create alert'}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
