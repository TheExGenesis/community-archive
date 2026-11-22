'use client'

import type { SearchAlertMode } from '@/lib/searchAlerts/input'

export interface ClientSearchAlert {
  id: string
  query: string
  mode: SearchAlertMode
  fromUser: string | null
  emailEnabled: boolean
  lastCheckedAt: string
  createdAt: string
}

export interface ClientNotification {
  id: string
  kind: 'search_alert'
  alertId: string
  query: string
  fromUser: string | null
  count: number
  firstMatchedAt: string
  updatedAt: string
  readAt: string | null
}

/** Fired after alerts or notifications change, so the bell refreshes. */
export const SEARCH_ALERTS_CHANGED = 'search-alerts-changed'
export const announceSearchAlertsChanged = () =>
  window.dispatchEvent(new Event(SEARCH_ALERTS_CHANGED))

export async function alertsRequest<T>(
  input: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(input, {
    cache: 'no-store',
    credentials: 'same-origin',
    ...init,
    headers: init.body
      ? { 'Content-Type': 'application/json', ...init.headers }
      : init.headers,
  })
  const body = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null
  if (!response.ok) {
    throw new Error(body?.error ?? 'Something went wrong. Please try again.')
  }
  return body as T
}
