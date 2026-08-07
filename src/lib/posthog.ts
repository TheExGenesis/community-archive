'use client'

import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import type {
  CaptureResult,
  PostHog,
  PostHogConfig,
  Properties,
} from 'posthog-js/dist/module.slim'
import { getSessionTwitterUsername } from '@/lib/sessionTwitterUsername'

type PostHogClient = Pick<PostHog, 'capture' | 'identify' | 'init' | 'reset'>

type SafeProperty = string | number | boolean
type PropertyValidator = (value: unknown) => value is SafeProperty

const isSafeProperty = (value: unknown): value is SafeProperty =>
  ['string', 'number', 'boolean'].includes(typeof value)
const isBoolean: PropertyValidator = (value): value is boolean =>
  typeof value === 'boolean'
const isNonnegativeInteger: PropertyValidator = (value): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const isActiveFilterCount: PropertyValidator = (value): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= 4
const isTrendBucket: PropertyValidator = (value): value is string =>
  typeof value === 'string' && ['day', 'week', 'month', 'year'].includes(value)
const isTrendMatch: PropertyValidator = (value): value is string =>
  typeof value === 'string' && ['all', 'any'].includes(value)
const isQuoteLimit: PropertyValidator = (value): value is number =>
  typeof value === 'number' && [10, 25, 50, 100].includes(value)

const allowedEventProperties: Record<
  string,
  Readonly<Record<string, PropertyValidator>>
> = {
  archive_upload_started: {
    includes_likes: isBoolean,
    date_filter_applied: isBoolean,
  },
  archive_upload_completed: {
    uploaded_tweet_count: isNonnegativeInteger,
    uploaded_like_count: isNonnegativeInteger,
    includes_likes: isBoolean,
  },
  tweet_streaming_preference_updated: { opted_in: isBoolean },
  explicit_opt_out_confirmed: { delete_archives: isBoolean },
  archive_deleted: {},
  all_archives_deleted: {},
  archive_search_submitted: {
    has_query: isBoolean,
    active_filter_count: isActiveFilterCount,
  },
  word_trend_requested: {
    bucket: isTrendBucket,
    match: isTrendMatch,
    has_start_date: isBoolean,
    has_end_date: isBoolean,
  },
  quote_ranking_requested: {
    limit: isQuoteLimit,
    excludes_self_quotes: isBoolean,
    has_include_filter: isBoolean,
    has_exclude_filter: isBoolean,
  },
  $identify: {},
}

const safeSdkProperties = new Set([
  'token',
  'distinct_id',
  '$anon_distinct_id',
  '$user_id',
  '$device_id',
  '$session_id',
  '$window_id',
  '$insert_id',
  '$time',
  '$lib',
  '$lib_version',
  '$is_identified',
  '$process_person_profile',
])

const blockedAutoProperties = [
  '$current_url',
  '$pathname',
  '$host',
  '$referrer',
  '$referring_domain',
  '$session_entry_url',
  '$session_entry_pathname',
  '$session_entry_host',
  '$session_entry_referrer',
  '$session_entry_referring_domain',
  '$initial_current_url',
  '$initial_pathname',
  '$initial_host',
  '$initial_referrer',
  '$initial_referring_domain',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'gad_source',
  'mc_cid',
  'gclid',
  'gclsrc',
  'dclid',
  'gbraid',
  'wbraid',
  'fbclid',
  'msclkid',
  'twclid',
  'li_fat_id',
  'igshid',
  'ttclid',
  'rdt_cid',
  'epik',
  'qclid',
  'sccid',
  'irclid',
  '_kx',
]

const publicUsernamePattern = /^[A-Za-z0-9_]{1,15}$/

let posthogClient: PostHogClient | null = null
let initializationPromise: Promise<PostHogClient | null> | null = null
let isIdentityReady = false
let resolveIdentityReady: () => void = () => undefined
const identityReadyPromise = new Promise<void>((resolve) => {
  resolveIdentityReady = resolve
})

export function sanitizePostHogEvent(
  event: CaptureResult | null,
): CaptureResult | null {
  if (!event) return null

  const eventProperties = allowedEventProperties[event.event]
  if (!eventProperties) return null

  for (const [key, validator] of Object.entries(eventProperties)) {
    if (!validator(event.properties[key])) return null
  }

  const properties: Properties = { $geoip_disable: true }
  for (const [key, value] of Object.entries(event.properties)) {
    const validator = eventProperties[key]
    if (
      (safeSdkProperties.has(key) && isSafeProperty(value)) ||
      validator?.(value)
    ) {
      properties[key] = value
    }
  }

  const sanitizedEvent: CaptureResult = {
    ...event,
    properties,
  }

  delete sanitizedEvent.$set_once
  delete sanitizedEvent.$unset

  if (event.event === '$identify') {
    const username = event.$set?.username
    sanitizedEvent.$set =
      typeof username === 'string' && publicUsernamePattern.test(username)
        ? { username }
        : undefined
  } else {
    delete sanitizedEvent.$set
  }

  return sanitizedEvent
}

export function createPostHogConfig(apiHost: string): Partial<PostHogConfig> {
  return {
    api_host: apiHost,
    advanced_disable_flags: true,
    autocapture: false,
    before_send: sanitizePostHogEvent,
    capture_pageview: false,
    capture_pageleave: false,
    capture_dead_clicks: false,
    capture_exceptions: false,
    capture_heatmaps: false,
    capture_performance: false,
    disable_conversations: true,
    disable_external_dependency_loading: true,
    disable_persistence: true,
    disable_product_tours: true,
    disable_session_recording: true,
    disable_surveys: true,
    disable_web_experiments: true,
    opt_in_site_apps: false,
    person_profiles: 'identified_only',
    property_denylist: blockedAutoProperties,
    respect_dnt: true,
    save_campaign_params: false,
    save_referrer: false,
    debug: process.env.NODE_ENV === 'development',
  }
}

export function initializePostHogClient(
  client: PostHogClient,
  projectToken: string | undefined,
  posthogHost: string | undefined,
): boolean {
  if (!projectToken || !posthogHost) return false

  try {
    client.init(projectToken, createPostHogConfig(posthogHost))
    return true
  } catch (error) {
    logPostHogError('initialization', error)
    return false
  }
}

export async function initializePostHog(): Promise<boolean> {
  return Boolean(await loadPostHogClient())
}

async function loadPostHogClient(): Promise<PostHogClient | null> {
  if (posthogClient) return posthogClient

  const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
  const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST
  if (!projectToken || !posthogHost) return null

  if (!initializationPromise) {
    initializationPromise = import('posthog-js/dist/module.slim')
      .then(({ default: client }) => {
        if (!initializePostHogClient(client, projectToken, posthogHost)) {
          return null
        }

        posthogClient = client
        return client
      })
      .catch((error) => {
        logPostHogError('loading', error)
        return null
      })
  }

  return initializationPromise
}

export function capturePostHogEvent(
  eventName: string,
  properties?: Record<string, unknown>,
) {
  void capturePostHogEventWhenReady(
    loadPostHogClient,
    () => identityReadyPromise,
    eventName,
    properties,
  )
}

export async function capturePostHogEventWhenReady(
  loadClient: () => Promise<PostHogClient | null>,
  waitUntilIdentityReady: () => Promise<void>,
  eventName: string,
  properties?: Record<string, unknown>,
): Promise<boolean> {
  const client = await loadClient()
  if (!client) return false
  await waitUntilIdentityReady()
  return capturePostHogEventWithClient(client, eventName, properties)
}

export function markPostHogIdentityReady() {
  if (isIdentityReady) return
  isIdentityReady = true
  resolveIdentityReady()
}

export function capturePostHogEventWithClient(
  client: Pick<PostHogClient, 'capture'>,
  eventName: string,
  properties?: Record<string, unknown>,
): boolean {
  try {
    client.capture(eventName, properties)
    return true
  } catch (error) {
    logPostHogError('event capture', error)
    return false
  }
}

type PostHogIdentityActions = {
  identify: (userId: string, properties: Record<string, unknown>) => void
  reset: () => void
}

const postHogIdentityActions: PostHogIdentityActions = {
  identify: (userId, properties) => {
    if (!posthogClient) return
    try {
      posthogClient.identify(userId, properties)
    } catch (error) {
      logPostHogError('identity update', error)
    }
  },
  reset: () => {
    if (!posthogClient) return
    try {
      posthogClient.reset()
    } catch (error) {
      logPostHogError('identity reset', error)
    }
  },
}

export function syncPostHogIdentity(
  event: AuthChangeEvent,
  session: Session | null,
  identifiedUserId: string | null,
  actions: PostHogIdentityActions = postHogIdentityActions,
): string | null {
  const user = session?.user

  if (event === 'SIGNED_OUT' || (event === 'INITIAL_SESSION' && !user)) {
    actions.reset()
    return null
  }

  if (!user || (event !== 'INITIAL_SESSION' && event !== 'SIGNED_IN')) {
    return identifiedUserId
  }

  if (event === 'INITIAL_SESSION' || identifiedUserId !== user.id) {
    actions.reset()
  }

  const username = getSessionTwitterUsername(user) ?? undefined

  actions.identify(user.id, { username })
  return user.id
}

function logPostHogError(action: string, error: unknown) {
  if (process.env.NODE_ENV === 'development') {
    console.warn(`PostHog ${action} failed`, error)
  }
}
