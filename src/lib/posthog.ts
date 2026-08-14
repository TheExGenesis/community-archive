'use client'

import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js'
import type {
  CaptureResult,
  PostHog,
  PostHogConfig,
  Properties,
} from 'posthog-js/dist/module.slim'
import { getSessionTwitterUsername } from '@/lib/sessionTwitterUsername'

type PostHogClient = Pick<
  PostHog,
  'capture' | 'get_property' | 'identify' | 'init' | 'reset'
>
type PostHogExtensionClasses = NonNullable<PostHogConfig['__extensionClasses']>
type PostHogInitializationOptions = {
  extensionClasses?: PostHogExtensionClasses
  loaded?: () => void
}

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
const isOneOf =
  (values: readonly string[]): PropertyValidator =>
  (value): value is string =>
    typeof value === 'string' && values.includes(value)
const isPortalSeriesCount: PropertyValidator = (value): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= 12

const isSearchSurface = isOneOf(['advanced', 'homepage'])
const isDashboardDestination = isOneOf([
  'all_time_bangers',
  'best_strands',
  'data_export',
  'live_stream',
  'recent_bangers',
  'research',
  'research_article',
  'tool',
  'tools',
  'trends',
])
const isDashboardLinkSurface = isOneOf(['card', 'list', 'panel_header'])
const isTweetCardAction = isOneOf([
  'collapse',
  'expand',
  'open',
  'open_archived_quotes',
  'open_quoted_tweet',
])
const isTweetOrigin = isOneOf([
  'bangers',
  'home',
  'search',
  'stream',
  'trends',
  'unknown',
])
const isBangersAction = isOneOf([
  'filters_cleared',
  'load_more_clicked',
  'retry_clicked',
  'scope_changed',
  'searched',
  'time_filter_changed',
])
const isBangersTimeRange = isOneOf([
  'all',
  'three_months',
  'today',
  'week',
  'year',
])
const isBangersSort = isOneOf(['quotes', 'recent'])
const isBangersScope = isOneOf(['all', 'members'])
const isTrendsExplorerAction = isOneOf([
  'chart_series_toggled',
  'evidence_filter_toggled',
  'evidence_refreshed',
  'retry_defaults',
  'scale_changed',
  'term_removed',
  'terms_added',
  'terms_reactivated',
  'year_filter_applied',
  'year_filter_cleared',
])

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
    surface: isSearchSurface,
  },
  dashboard_destination_opened: {
    destination: isDashboardDestination,
    surface: isDashboardLinkSurface,
    external: isBoolean,
  },
  tweet_card_action: {
    action: isTweetCardAction,
    origin: isTweetOrigin,
    has_media: isBoolean,
    has_quoted_tweet: isBoolean,
    is_featured: isBoolean,
  },
  bangers_action: {
    action: isBangersAction,
    has_query: isBoolean,
    time_range: isBangersTimeRange,
    sort: isBangersSort,
    scope: isBangersScope,
    result_count: isNonnegativeInteger,
  },
  trends_explorer_action: {
    action: isTrendsExplorerAction,
    series_count: isPortalSeriesCount,
    enabled_series_count: isPortalSeriesCount,
    included_series_count: isPortalSeriesCount,
    has_year_filter: isBoolean,
  },
  portal_stream_loaded_more: {
    loaded_tweet_count: isNonnegativeInteger,
    has_more: isBoolean,
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

const campaignProperties = new Set([
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
])

const publicUsernamePattern = /^[A-Za-z0-9_]{1,15}$/
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const isDisplayName = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  value.trim().length <= 100

const isEmail = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 320 && emailPattern.test(value)

let posthogClient: PostHogClient | null = null
let initializationPromise: Promise<PostHogClient | null> | null = null
let postHogIdentifiedUserId: string | null = null
let isPostHogBootstrapEnabled = true
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
  const isSdkEvent = event.event.startsWith('$')
  if (!eventProperties && !isSdkEvent) return null

  if (eventProperties) {
    for (const [key, validator] of Object.entries(eventProperties)) {
      if (!validator(event.properties[key])) return null
    }
  }

  let properties: Properties
  if (eventProperties) {
    properties = { $geoip_disable: true }
    for (const [key, value] of Object.entries(event.properties)) {
      const validator = eventProperties[key]
      if (
        key.startsWith('$') ||
        campaignProperties.has(key) ||
        (safeSdkProperties.has(key) && isSafeProperty(value)) ||
        validator?.(value)
      ) {
        properties[key] = value
      }
    }
  } else {
    properties = { ...event.properties, $geoip_disable: true }
  }

  const sanitizedEvent: CaptureResult = {
    ...event,
    properties,
  }

  if (event.event === '$identify') {
    const personProperties: Properties = {}
    const username = event.$set?.username
    const email = event.$set?.email
    const name = event.$set?.name

    if (typeof username === 'string' && publicUsernamePattern.test(username)) {
      personProperties.username = username
    }
    if (isEmail(email)) personProperties.email = email
    if (isDisplayName(name)) personProperties.name = name.trim()

    sanitizedEvent.$set = Object.keys(personProperties).length
      ? personProperties
      : undefined
  }

  return sanitizedEvent
}

export function createPostHogConfig(
  apiHost: string,
  options: PostHogInitializationOptions = {},
): Partial<PostHogConfig> {
  const config: Partial<PostHogConfig> = {
    api_host: apiHost,
    defaults: '2026-06-25',
    // Replay needs the remote recording configuration from /flags. Keep the
    // configuration request while skipping actual feature-flag evaluation.
    advanced_disable_flags: false,
    advanced_disable_feature_flags: true,
    autocapture: true,
    before_send: sanitizePostHogEvent,
    capture_pageview: 'history_change',
    capture_pageleave: 'if_capture_pageview',
    capture_dead_clicks: false,
    capture_exceptions: true,
    capture_heatmaps: false,
    capture_performance: {
      network_timing: true,
      web_vitals: true,
      web_vitals_attribution: false,
    },
    disable_conversations: true,
    disable_external_dependency_loading: true,
    disable_persistence: false,
    disable_product_tours: true,
    disable_session_recording: false,
    disable_surveys: true,
    disable_web_experiments: true,
    enable_recording_console_log: false,
    mask_all_element_attributes: false,
    mask_all_text: false,
    opt_in_site_apps: false,
    persistence: 'localStorage+cookie',
    person_profiles: 'identified_only',
    respect_dnt: true,
    save_campaign_params: true,
    save_referrer: true,
    session_recording: {
      maskAllInputs: false,
      maskInputOptions: { password: true },
      recordBody: false,
      recordHeaders: false,
    },
    debug: process.env.NODE_ENV === 'development',
  }

  if (options.extensionClasses) {
    config.__extensionClasses = options.extensionClasses
  }
  if (options.loaded) config.loaded = options.loaded

  return config
}

export function initializePostHogClient(
  client: PostHogClient,
  projectToken: string | undefined,
  posthogHost: string | undefined,
  options: PostHogInitializationOptions = {},
): boolean {
  if (!projectToken || !posthogHost) return false

  try {
    client.init(projectToken, createPostHogConfig(posthogHost, options))
    return true
  } catch (error) {
    logPostHogError('initialization', error)
    return false
  }
}

export async function initializePostHog(
  initialSession: Session | null,
): Promise<{ enabled: boolean; identifiedUserId: string | null }> {
  const client = await loadPostHogClient(initialSession)
  markPostHogIdentityReady()
  return {
    enabled: Boolean(client),
    identifiedUserId: postHogIdentifiedUserId,
  }
}

async function loadPostHogClient(
  initialSession: Session | null = null,
): Promise<PostHogClient | null> {
  if (!isPostHogBootstrapEnabled) return null
  if (posthogClient) return posthogClient

  const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
  const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST
  if (!projectToken || !posthogHost) return null

  if (!initializationPromise) {
    initializationPromise = import('@/lib/posthogRuntime')
      .then(({ default: client, postHogMonitoringExtensions }) => {
        const identityActions: PostHogIdentityActions = {
          identify: (userId, properties) => client.identify(userId, properties),
          reset: () => client.reset(),
          getPersistedUserId: () => {
            const userId = client.get_property('$user_id')
            return typeof userId === 'string' ? userId : null
          },
        }
        const initialized = initializePostHogClient(
          client,
          projectToken,
          posthogHost,
          {
            extensionClasses: postHogMonitoringExtensions,
            loaded: () => {
              postHogIdentifiedUserId = syncPostHogIdentity(
                'INITIAL_SESSION',
                initialSession,
                postHogIdentifiedUserId,
                identityActions,
              )
              markPostHogIdentityReady()
            },
          },
        )
        if (!initialized) {
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
  await waitUntilIdentityReady()
  const client = await loadClient()
  if (!client) return false
  return capturePostHogEventWithClient(client, eventName, properties)
}

export function markPostHogIdentityReady() {
  if (isIdentityReady) return
  isIdentityReady = true
  resolveIdentityReady()
}

export function disablePostHogAfterIdentityFailure() {
  isPostHogBootstrapEnabled = false
  markPostHogIdentityReady()
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
  getPersistedUserId?: () => string | null
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
  getPersistedUserId: () => {
    const userId = posthogClient?.get_property('$user_id')
    return typeof userId === 'string' ? userId : null
  },
}

export function syncPostHogIdentity(
  event: AuthChangeEvent,
  session: Session | null,
  identifiedUserId: string | null,
  actions: PostHogIdentityActions = postHogIdentityActions,
): string | null {
  const user = session?.user
  const persistedUserId = actions.getPersistedUserId?.() ?? identifiedUserId

  if (event === 'SIGNED_OUT') {
    actions.reset()
    return null
  }

  if (event === 'INITIAL_SESSION' && !user) {
    if (persistedUserId) actions.reset()
    return null
  }

  if (!user || (event !== 'INITIAL_SESSION' && event !== 'SIGNED_IN')) {
    return identifiedUserId
  }

  if (persistedUserId && persistedUserId !== user.id) {
    actions.reset()
  }

  actions.identify(user.id, getPostHogPersonProperties(user))
  return user.id
}

export function getPostHogPersonProperties(user: User): Record<string, string> {
  const properties: Record<string, string> = {}
  const username = getSessionTwitterUsername(user)
  const displayName = getTwitterDisplayName(user)

  if (username) properties.username = username
  if (isEmail(user.email)) properties.email = user.email
  if (displayName) properties.name = displayName

  return properties
}

function getTwitterDisplayName(user: User): string | null {
  const identity =
    user.identities?.find((item) =>
      ['twitter', 'x'].includes(item.provider ?? ''),
    ) ?? null
  const identityData = (identity?.identity_data ?? {}) as Record<
    string,
    unknown
  >

  for (const key of ['full_name', 'name']) {
    const value = identityData[key]
    if (isDisplayName(value)) return value.trim()
  }

  return null
}

function logPostHogError(action: string, error: unknown) {
  if (process.env.NODE_ENV === 'development') {
    console.warn(`PostHog ${action} failed`, error)
  }
}
