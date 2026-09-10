'use client'

import { productFeatures, productActions } from './productActionSchema'
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js'
import type {
  CaptureResult,
  PostHog,
  PostHogConfig,
  Properties,
} from 'posthog-js/dist/module.slim'
import {
  analyticsRoute,
  analyticsFeature,
  analyticsPageNames,
  sanitizeAnalyticsUrl,
} from './analyticsRoutes'
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
type PropertyValidator = (value: unknown) => boolean

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

const isSearchSurface = isOneOf(['advanced', 'header', 'homepage'])
const isDashboardDestination = isOneOf([
  'all_time_bangers',
  'best_strands',
  'community_builds',
  'daily_digest',
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
  'open_external',
  'open_quoted_tweet',
])
const isTweetOrigin = isOneOf([
  // 'opportunities' is the Bulletin page's launch name, kept for event continuity.
  'opportunities',
  'bangers',
  'digest',
  'home',
  'profile',
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
  'granularity_changed',
  'retry_defaults',
  'scale_changed',
  'term_removed',
  'terms_added',
  'terms_reactivated',
  'year_filter_applied',
  'year_filter_cleared',
])
const isProductPage = isOneOf(analyticsPageNames)
const isNavigationDestination = isOneOf([
  ...analyticsPageNames,
  'sign_in',
  'sign_out',
  'upload_archive',
])
const isNavigationSurface = isOneOf([
  'account_menu',
  'brand',
  'desktop',
  'mobile',
])
const isHomepageAction = isOneOf(['get_extension', 'opt_in', 'upload_archive'])
const isDigestAction = isOneOf([
  'bangers_opened',
  'edition_selected',
  'keyword_search_opened',
  'recent_edition_opened',
  'story_opened',
  'subscribed',
])
const isDigestSurface = isOneOf([
  'calendar',
  'edition_cta',
  'edition_title',
  'keyword',
  'recent_editions',
  'sidebar',
  'subscribe',
])
const isUserDirectoryAction = isOneOf([
  'profile_opened',
  'searched',
  'sort_changed',
])
const isDirectorySort = isOneOf([
  'account_display_name',
  'joined_at',
  'num_followers',
])
const isSortOrder = isOneOf(['asc', 'desc'])
const isSearchInterfaceAction = isOneOf([
  'advanced_options_closed',
  'advanced_options_opened',
  'result_sort_changed',
  'starter_search_selected',
])
const isSettingsTab = isOneOf(['archives', 'privacy', 'tweets'])

const profileCurationProperties = {
  action: isOneOf([
    'add',
    'dismiss',
    'restore-item',
    'toggle-feature',
    'reorder',
    'restore',
  ]),
  section: isOneOf(['bangers', 'people']),
  source: isOneOf(['profile', 'tweet_card']),
}

export const allowedEventProperties = {
  community_app_action: {
    action: isOneOf(['details_opened', 'launch_clicked']),
    // Public catalog slugs include newly approved apps; never a URL or user input.
    app_slug: (value: unknown) =>
      typeof value === 'string' &&
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) &&
      value.length <= 120,
    source: isOneOf(['gallery_card', 'gallery_dialog', 'homepage', 'tools']),
    external: (value) => value === undefined || isBoolean(value),
  },
  profile_edit_started: {},
  profile_curation_saved: {
    ...profileCurationProperties,
    is_featured: (value) => value === undefined || isBoolean(value),
  },
  profile_curation_failed: profileCurationProperties,
  site_page_viewed: { page: isProductPage },
  product_action: {
    feature: isOneOf(productFeatures),
    action: isOneOf(productActions),
  },
  own_tweet_deleted: {},
  archive_upload_failed: { error_category: isOneOf(['upload_failed']) },
  search_results_failed: {
    error_category: isOneOf(['request_failed']),
    elapsed_ms: isNonnegativeInteger,
  },
  search_results_received: {
    phase: isOneOf(['preview', 'canonical']),
    result_count: isNonnegativeInteger,
    elapsed_ms: isNonnegativeInteger,
    page: isNonnegativeInteger,
  },
  website_section_ready: {
    page: isOneOf([
      'home',
      'directory',
      'profile',
      'tweet',
      'search',
      'bangers',
      'digest',
      'gallery',
      'graph',
      'stream',
      'trends',
      'research',
      'docs',
    ]),
    section: isOneOf([
      'navigation_shell',
      'homepage_stats',
      'homepage_digest',
      'homepage_stream',
      'bangers_results',
      'stream_feed',
      'gallery_catalog',
      'profile_feed',
      'profile_header',
      'directory_rows',
      'digest_article',
    ]),
    navigation_type: isOneOf(['client', 'history', 'document', 'unknown']),
    elapsed_ms: (value) => value === undefined || isNonnegativeInteger(value),
  },
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
  product_page_viewed: { page: isProductPage },
  navigation_item_clicked: {
    destination: isNavigationDestination,
    surface: isNavigationSurface,
    already_active: isBoolean,
  },
  homepage_action_clicked: {
    action: isHomepageAction,
    authenticated: isBoolean,
  },
  digest_action: {
    action: isDigestAction,
    surface: isDigestSurface,
  },
  user_directory_action: {
    action: isUserDirectoryAction,
    has_query: isBoolean,
    sort_by: isDirectorySort,
    sort_order: isSortOrder,
    visible_result_count: isNonnegativeInteger,
  },
  search_interface_action: {
    action: isSearchInterfaceAction,
    has_query: isBoolean,
    active_filter_count: isActiveFilterCount,
  },
  settings_tab_selected: { tab: isSettingsTab },
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
} satisfies Record<string, Readonly<Record<string, PropertyValidator>>>

export type PostHogEventName = keyof typeof allowedEventProperties

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

  const eventProperties = (
    allowedEventProperties as Record<
      string,
      Readonly<Record<string, PropertyValidator>>
    >
  )[event.event]
  const isSdkEvent = event.event.startsWith('$')
  if (!eventProperties && !isSdkEvent) {
    if (process.env.NODE_ENV === 'development')
      console.warn('PostHog rejected an unregistered event')
    return null
  }

  if (eventProperties) {
    for (const [key, validator] of Object.entries(eventProperties)) {
      if (!validator(event.properties[key])) {
        if (process.env.NODE_ENV === 'development')
          console.warn('PostHog rejected an invalid event schema')
        return null
      }
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
        (value !== undefined && validator?.(value))
      ) {
        properties[key] = value
      }
    }
  } else {
    properties = { ...event.properties, $geoip_disable: true }
  }

  for (const key of [
    '$current_url',
    '$session_entry_url',
    '$session_exit_url',
    '$referrer',
    '$initial_current_url',
    '$initial_referrer',
  ]) {
    if (key in properties)
      properties[key] = sanitizeAnalyticsUrl(properties[key])
  }
  if (typeof properties.$pathname === 'string')
    properties.$pathname = analyticsRoute(properties.$pathname).path
  const rawUrl = event.properties.$current_url
  let pathname: string | undefined
  try {
    if (typeof rawUrl === 'string') pathname = new URL(rawUrl).pathname
  } catch {
    /* invalid context */
  }
  if (!pathname && typeof window !== 'undefined')
    pathname = window.location.pathname
  if (pathname) {
    const route = analyticsRoute(pathname)
    properties.route_name = route.page
    properties.page_group = route.group
    if (event.event !== 'product_action')
      properties.feature = analyticsFeature(route.page)
  }
  properties.analytics_version = 2

  const sanitizedEvent: CaptureResult = {
    ...event,
    properties,
  }

  for (const key of ['$set', '$set_once'] as const) {
    const source = sanitizedEvent[key]
    if (!source) continue
    sanitizedEvent[key] = { ...source }
    for (const property of Object.keys(source)) {
      if (/url|referrer/.test(property))
        sanitizedEvent[key]![property] = sanitizeAnalyticsUrl(source[property])
    }
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
    mask_all_element_attributes: true,
    mask_all_text: true,
    opt_in_site_apps: false,
    persistence: 'localStorage+cookie',
    person_profiles: 'identified_only',
    respect_dnt: true,
    save_campaign_params: true,
    save_referrer: true,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: '*',
      blockSelector: '.ph-no-capture',
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
  eventName: PostHogEventName,
  properties?: Record<string, unknown>,
) {
  void capturePostHogEventWhenReady(
    loadPostHogClient,
    () => identityReadyPromise,
    eventName,
    {
      // Snapshot context before async SDK/identity initialization or navigation.
      ...(typeof window === 'undefined'
        ? {}
        : { $current_url: window.location.href }),
      ...properties,
    },
  )
}

export async function capturePostHogEventWhenReady(
  loadClient: () => Promise<PostHogClient | null>,
  waitUntilIdentityReady: () => Promise<void>,
  eventName: PostHogEventName,
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
  eventName: PostHogEventName,
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
