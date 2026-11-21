'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import {
  alertsRequest,
  announceSearchAlertsChanged,
  type ClientSearchAlert,
} from '@/components/searchAlerts/client'
import { ToggleSwitch } from '@/components/searchAlerts/ToggleSwitch'
import { captureProductAction } from '@/lib/productAnalytics'
import {
  MAX_SEARCH_ALERTS_PER_USER,
  searchAlertLabel,
  searchAlertSearchHref,
} from '@/lib/searchAlerts/input'

const UNSUBSCRIBE_NOTICES: Record<string, string> = {
  unsubscribed: 'Alert emails are off. In-site alerts keep working.',
  invalid: 'That unsubscribe link is not valid any more.',
  error: 'We could not turn alert emails off. Please try again here.',
}

const createdLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

/** Saved search alerts: email switch and delete per alert. */
export function SearchAlertsSettings({
  initialAlerts,
}: {
  initialAlerts: ClientSearchAlert[]
}) {
  const [alerts, setAlerts] = useState(initialAlerts)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get('alertEmail')
    if (status && UNSUBSCRIBE_NOTICES[status]) {
      setNotice(UNSUBSCRIBE_NOTICES[status])
    }
  }, [])

  const run = async (id: string, work: () => Promise<void>) => {
    setBusy(id)
    setError(null)
    try {
      await work()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const setEmail = (alert: ClientSearchAlert, emailEnabled: boolean) =>
    run(alert.id, async () => {
      const body = await alertsRequest<{ alert: ClientSearchAlert }>(
        `/api/search-alerts/${alert.id}`,
        { method: 'PATCH', body: JSON.stringify({ emailEnabled }) },
      )
      captureProductAction('search_alerts', 'setting_changed')
      setAlerts((current) =>
        current.map((item) => (item.id === alert.id ? body.alert : item)),
      )
    })

  const remove = (alert: ClientSearchAlert) =>
    run(alert.id, async () => {
      await alertsRequest(`/api/search-alerts/${alert.id}`, {
        method: 'DELETE',
      })
      captureProductAction('search_alerts', 'alert_deleted')
      setAlerts((current) => current.filter((item) => item.id !== alert.id))
      announceSearchAlertsChanged()
    })

  return (
    <section
      id="search-alerts"
      className="mb-8 scroll-mt-20 rounded-lg border bg-card p-6"
    >
      <h2 className="text-lg font-semibold">Search alerts</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Saved searches checked every hour. New matches show under the bell; turn
        on email for a daily roll-up. {alerts.length} of{' '}
        {MAX_SEARCH_ALERTS_PER_USER} used.
      </p>
      {notice && (
        <p
          role="status"
          className="mt-3 rounded-md bg-brand/5 px-3 py-2 text-sm"
        >
          {notice}
        </p>
      )}

      {alerts.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed px-4 py-5 text-sm text-muted-foreground">
          No alerts yet.{' '}
          <Link href="/search" className="font-semibold text-brand">
            Search the archive
          </Link>{' '}
          and choose{' '}
          <span className="font-medium text-foreground">Create alert</span>.
        </p>
      ) : (
        <ul className="mt-4 divide-y rounded-md border">
          {alerts.map((alert) => (
            <li
              key={alert.id}
              className="flex items-center justify-between gap-4 px-4 py-3"
            >
              <div className="min-w-0">
                <Link
                  href={searchAlertSearchHref(alert)}
                  className="block truncate text-sm font-semibold hover:text-brand"
                >
                  {searchAlertLabel(alert)}
                </Link>
                <div className="text-xs text-muted-foreground">
                  Since {createdLabel(alert.createdAt)} ·{' '}
                  {alert.mode === 'phrase' ? 'exact phrase' : 'all words'}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  Daily email
                </span>
                <ToggleSwitch
                  checked={alert.emailEnabled}
                  label={`Daily email for ${searchAlertLabel(alert)}`}
                  disabled={busy !== null}
                  onChange={(next) => void setEmail(alert, next)}
                />
                <button
                  type="button"
                  onClick={() => void remove(alert)}
                  disabled={busy !== null}
                  aria-label={`Delete alert ${searchAlertLabel(alert)}`}
                  title="Delete alert"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-destructive disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  )
}
