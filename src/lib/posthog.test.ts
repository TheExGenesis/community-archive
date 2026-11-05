import type { Session } from '@supabase/supabase-js'
import type {
  CaptureResult,
  PostHog,
  PostHogConfig,
} from 'posthog-js/dist/module.slim'
import {
  capturePostHogEvent,
  initializePostHog,
  capturePostHogEventWhenReady,
  capturePostHogEventWithClient,
  createPostHogConfig,
  getPostHogPersonProperties,
  initializePostHogClient,
  sanitizePostHogEvent,
  syncPostHogIdentity,
} from './posthog'

type TestPostHogClient = Pick<
  PostHog,
  | 'capture'
  | 'get_property'
  | 'identify'
  | 'init'
  | 'reset'
  | 'opt_in_capturing'
  | 'opt_out_capturing'
  | 'stopSessionRecording'
  | 'startSessionRecording'
>

function createClient(): jest.Mocked<TestPostHogClient> {
  return {
    opt_in_capturing: jest.fn(),
    opt_out_capturing: jest.fn(),
    stopSessionRecording: jest.fn(),
    startSessionRecording: jest.fn(),
    capture: jest.fn(),
    get_property: jest.fn(),
    identify: jest.fn(),
    init: jest.fn(),
    reset: jest.fn(),
  } as unknown as jest.Mocked<TestPostHogClient>
}

function captureResult(
  event: string,
  properties: Record<string, unknown>,
): CaptureResult {
  return {
    event,
    properties,
    uuid: '00000000-0000-0000-0000-000000000000',
  } as CaptureResult
}

function sessionFor(userId: string): Session {
  return {
    user: {
      id: userId,
      email: `${userId}@example.com`,
      user_metadata: {
        full_name: 'Archive User',
        user_name: 'mutable_impostor',
      },
      identities: [
        {
          provider: 'twitter',
          identity_data: {
            user_name: 'archive_user',
            full_name: 'Archive User',
          },
        },
      ],
    },
  } as unknown as Session
}

describe('sanitizePostHogEvent', () => {
  it('keeps page context while rejecting unexpected custom properties', () => {
    const event = captureResult('archive_search_submitted', {
      token: 'project-token',
      distinct_id: 'user-123',
      has_query: true,
      active_filter_count: 2,
      surface: 'advanced',
      $current_url: 'https://www.community-archive.org/search?q=private-words',
      $session_entry_url:
        'https://www.community-archive.org/search?q=private-words',
      utm_campaign: 'archive-launch',
      query: 'private-words',
      email: 'private@example.com',
    })

    expect(sanitizePostHogEvent(event)?.properties).toEqual({
      $geoip_disable: true,
      token: 'project-token',
      distinct_id: 'user-123',
      $current_url: 'https://www.community-archive.org/search',
      $session_entry_url: 'https://www.community-archive.org/search',
      analytics_version: 2,
      route_name: 'search',
      page_group: 'product',
      feature: 'search',
      utm_campaign: 'archive-launch',
      has_query: true,
      active_filter_count: 2,
      surface: 'advanced',
    })
  })

  it.each([
    [
      'dashboard_destination_opened',
      {
        destination: 'daily_digest',
        surface: 'card',
        external: false,
      },
    ],
    [
      'tweet_card_action',
      {
        action: 'expand',
        origin: 'digest',
        has_media: true,
        has_quoted_tweet: false,
        is_featured: true,
      },
    ],
    [
      'bangers_action',
      {
        action: 'searched',
        has_query: true,
        time_range: 'three_months',
        sort: 'quotes',
        scope: 'members',
        result_count: 42,
      },
    ],
    [
      'trends_explorer_action',
      {
        action: 'terms_added',
        series_count: 6,
        enabled_series_count: 5,
        included_series_count: 2,
        has_year_filter: false,
      },
    ],
    ['product_page_viewed', { page: 'user_directory' }],
    [
      'navigation_item_clicked',
      {
        destination: 'bangers',
        surface: 'desktop',
        already_active: false,
      },
    ],
    ['digest_action', { action: 'story_opened', surface: 'edition_cta' }],
    [
      'user_directory_action',
      {
        action: 'profile_opened',
        has_query: false,
        sort_by: 'num_followers',
        sort_order: 'desc',
        visible_result_count: 15,
      },
    ],
    [
      'search_interface_action',
      {
        action: 'advanced_options_opened',
        has_query: false,
        active_filter_count: 0,
      },
    ],
    ['settings_tab_selected', { tab: 'archives' }],
    ['portal_stream_loaded_more', { loaded_tweet_count: 30, has_more: true }],
  ])('keeps aggregate properties for %s', (eventName, properties) => {
    const event = captureResult(eventName, {
      ...properties,
      analytics_version: 2,
      query: 'do not send this',
      tweet_id: '1234567890',
    })

    expect(sanitizePostHogEvent(event)?.properties).toEqual({
      $geoip_disable: true,
      ...properties,
      analytics_version: 2,
    })
  })

  it('keeps the supported signed-in identity properties', () => {
    const event = {
      ...captureResult('$identify', {
        token: 'project-token',
        distinct_id: 'user-123',
        $anon_distinct_id: 'anonymous-123',
        $current_url:
          'https://www.community-archive.org/search?q=private-words',
      }),
      $set: {
        username: 'archive_user',
        email: 'archive@example.com',
        name: 'Archive User',
        secret: 'not-a-person-property',
      },
      $set_once: {
        $initial_current_url:
          'https://www.community-archive.org/search?q=private-words',
      },
    }

    expect(sanitizePostHogEvent(event)).toMatchObject({
      properties: {
        $geoip_disable: true,
        token: 'project-token',
        distinct_id: 'user-123',
        $anon_distinct_id: 'anonymous-123',
      },
      $set: {
        username: 'archive_user',
        email: 'archive@example.com',
        name: 'Archive User',
      },
      $set_once: {
        $initial_current_url: 'https://www.community-archive.org/search',
      },
    })
  })

  it('rejects out-of-schema values', () => {
    const event = {
      ...captureResult('quote_ranking_requested', {
        token: 'project-token',
        distinct_id: 'user-123',
        limit: 999,
        excludes_self_quotes: 'yes',
        has_include_filter: false,
        has_exclude_filter: false,
      }),
      $set: { username: 'not a valid X username' },
    }

    expect(sanitizePostHogEvent(event)).toBeNull()
  })

  it('drops invalid identify properties', () => {
    const event = {
      ...captureResult('$identify', {
        token: 'project-token',
        distinct_id: 'user-123',
      }),
      $set: {
        username: 'not a valid X username',
        email: 'not-an-email',
        name: ' '.repeat(101),
      },
    }

    expect(sanitizePostHogEvent(event)?.$set).toBeUndefined()
  })

  it('allows SDK-generated monitoring events and preserves their context', () => {
    const pageview = captureResult('$pageview', {
      $current_url: 'https://example.com/search?q=public-query',
      $referrer: 'https://example.org/',
    })

    expect(sanitizePostHogEvent(pageview)?.properties).toEqual({
      $current_url: 'https://example.com',
      $referrer: 'https://example.org',
      $geoip_disable: true,
      analytics_version: 2,
      route_name: 'search',
      page_group: 'product',
      feature: 'search',
    })
  })

  it('still rejects unknown custom product events', () => {
    expect(sanitizePostHogEvent(captureResult('archive_text', {}))).toBeNull()
  })
})

describe('createPostHogConfig', () => {
  it('enables full browser monitoring while retaining explicit safeguards', () => {
    expect(createPostHogConfig('https://analytics.example.com')).toMatchObject({
      api_host: 'https://analytics.example.com',
      advanced_disable_flags: false,
      advanced_disable_feature_flags: true,
      autocapture: true,
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
      opt_in_site_apps: false,
      persistence: 'localStorage+cookie',
      person_profiles: 'identified_only',
      respect_dnt: true,
      save_campaign_params: true,
      save_referrer: true,
      session_recording: {
        maskAllInputs: true,
        maskInputOptions: { password: true },
        recordBody: false,
        recordHeaders: false,
      },
    })
  })

  it('passes selectively bundled extensions and the identity bootstrap hook', () => {
    const extensionClasses = {} as NonNullable<
      PostHogConfig['__extensionClasses']
    >
    const loaded = jest.fn()

    expect(
      createPostHogConfig('https://analytics.example.com', {
        extensionClasses,
        loaded,
      }),
    ).toMatchObject({
      __extensionClasses: extensionClasses,
      loaded,
    })
  })
})

describe('initializePostHogClient', () => {
  it('is optional when public environment variables are missing', () => {
    const client = createClient()

    expect(initializePostHogClient(client, undefined, undefined)).toBe(false)
    expect(client.init).not.toHaveBeenCalled()
  })

  it('initializes a configured client with the full monitoring config', () => {
    const client = createClient()

    expect(
      initializePostHogClient(
        client,
        'project-token',
        'https://analytics.example.com',
      ),
    ).toBe(true)
    expect(client.init).toHaveBeenCalledWith(
      'project-token',
      expect.objectContaining({
        api_host: 'https://analytics.example.com',
        disable_persistence: false,
        disable_session_recording: false,
      }),
    )
  })

  it('does not throw when the SDK fails to initialize', () => {
    const client = createClient()
    client.init.mockImplementation(() => {
      throw new Error('blocked storage')
    })

    expect(
      initializePostHogClient(
        client,
        'project-token',
        'https://analytics.example.com',
      ),
    ).toBe(false)
  })
})

describe('capturePostHogEventWithClient', () => {
  it('captures only the provided event and aggregate properties', () => {
    const client = createClient()

    expect(
      capturePostHogEventWithClient(client, 'archive_search_submitted', {
        has_query: true,
        active_filter_count: 0,
        surface: 'advanced',
      }),
    ).toBe(true)
    expect(client.capture).toHaveBeenCalledWith('archive_search_submitted', {
      has_query: true,
      active_filter_count: 0,
      surface: 'advanced',
    })
  })

  it('does not throw when the SDK fails to capture', () => {
    const client = createClient()
    client.capture.mockImplementation(() => {
      throw new Error('network blocked')
    })

    expect(capturePostHogEventWithClient(client, 'archive_deleted')).toBe(false)
  })
})

describe('capturePostHogEventWhenReady', () => {
  it('preserves an event until the deferred client is ready', async () => {
    const client = createClient()
    let resolveClient: (client: TestPostHogClient) => void = () => undefined
    const clientPromise = new Promise<TestPostHogClient>((resolve) => {
      resolveClient = resolve
    })

    const capturePromise = capturePostHogEventWhenReady(
      () => clientPromise,
      () => Promise.resolve(),
      'word_trend_requested',
      {
        bucket: 'month',
        match: 'all',
        has_start_date: false,
        has_end_date: false,
      },
    )
    expect(client.capture).not.toHaveBeenCalled()

    resolveClient(client)

    await expect(capturePromise).resolves.toBe(true)
    expect(client.capture).toHaveBeenCalledWith('word_trend_requested', {
      bucket: 'month',
      match: 'all',
      has_start_date: false,
      has_end_date: false,
    })
  })

  it('waits for auth identity before sending a linked event', async () => {
    const client = createClient()
    const loadClient = jest.fn(() => Promise.resolve(client))
    let resolveIdentity: () => void = () => undefined
    const identityPromise = new Promise<void>((resolve) => {
      resolveIdentity = resolve
    })

    const capturePromise = capturePostHogEventWhenReady(
      loadClient,
      () => identityPromise,
      'archive_deleted',
    )
    await Promise.resolve()
    expect(loadClient).not.toHaveBeenCalled()
    expect(client.capture).not.toHaveBeenCalled()

    resolveIdentity()

    await expect(capturePromise).resolves.toBe(true)
    expect(client.capture).toHaveBeenCalledWith('archive_deleted', undefined)
  })
})

describe('syncPostHogIdentity', () => {
  const identify = jest.fn()
  const reset = jest.fn()
  const getPersistedUserId = jest.fn<ReturnType<() => string | null>, []>()
  const optIn = jest.fn()
  const optOut = jest.fn()
  const actions = { identify, reset, getPersistedUserId, optIn, optOut }

  beforeEach(() => {
    optIn.mockReset()
    optOut.mockReset()
    identify.mockReset()
    reset.mockReset()
    getPersistedUserId.mockReset().mockReturnValue(null)
  })

  it('identifies an initial signed-in user with useful account context', () => {
    expect(
      syncPostHogIdentity(
        'INITIAL_SESSION',
        sessionFor('user-123'),
        null,
        actions,
      ),
    ).toBe('user-123')
    expect(reset).not.toHaveBeenCalled()
    expect(identify).toHaveBeenCalledWith('user-123', {
      email: 'user-123@example.com',
      name: 'Archive User',
      username: 'archive_user',
    })
  })

  it('resets before identifying a different signed-in user', () => {
    expect(
      syncPostHogIdentity(
        'SIGNED_IN',
        sessionFor('second-user'),
        'first-user',
        actions,
      ),
    ).toBe('second-user')
    expect(reset).toHaveBeenCalledTimes(1)
  })

  it('does not reset a matching persisted signed-in identity', () => {
    getPersistedUserId.mockReturnValue('user-123')

    expect(
      syncPostHogIdentity(
        'INITIAL_SESSION',
        sessionFor('user-123'),
        null,
        actions,
      ),
    ).toBe('user-123')
    expect(reset).not.toHaveBeenCalled()
  })

  it('resets a different persisted signed-in identity', () => {
    getPersistedUserId.mockReturnValue('previous-user')

    expect(
      syncPostHogIdentity(
        'INITIAL_SESSION',
        sessionFor('user-123'),
        null,
        actions,
      ),
    ).toBe('user-123')
    expect(reset).toHaveBeenCalledTimes(1)
  })

  it('resets identity on sign-out', () => {
    expect(
      syncPostHogIdentity('SIGNED_OUT', null, 'user-123', actions),
    ).toBeNull()
    expect(reset).toHaveBeenCalledTimes(1)
    expect(optOut).toHaveBeenCalledTimes(1)
    expect(optOut.mock.invocationCallOrder[0]).toBeLessThan(
      reset.mock.invocationCallOrder[0],
    )
  })

  it('clears a previous identity for an initial signed-out session', () => {
    expect(
      syncPostHogIdentity('INITIAL_SESSION', null, 'previous-user', actions),
    ).toBeNull()
    expect(reset).toHaveBeenCalledTimes(1)
    expect(identify).not.toHaveBeenCalled()
  })

  it('preserves an anonymous identity on an initial signed-out session', () => {
    expect(
      syncPostHogIdentity('INITIAL_SESSION', null, null, actions),
    ).toBeNull()
    expect(reset).not.toHaveBeenCalled()
    expect(identify).not.toHaveBeenCalled()
  })

  it('clears a stale persisted signed-in identity', () => {
    getPersistedUserId.mockReturnValue('previous-user')

    expect(
      syncPostHogIdentity('INITIAL_SESSION', null, null, actions),
    ).toBeNull()
    expect(reset).toHaveBeenCalledTimes(1)
  })
})

describe('getPostHogPersonProperties', () => {
  it('uses the authenticated email and trusted Twitter identity', () => {
    expect(getPostHogPersonProperties(sessionFor('user-123').user)).toEqual({
      email: 'user-123@example.com',
      name: 'Archive User',
      username: 'archive_user',
    })
  })

  it('does not use mutable user metadata for identity', () => {
    const session = sessionFor('user-123')
    session.user.identities = []

    expect(getPostHogPersonProperties(session.user)).toEqual({
      email: 'user-123@example.com',
    })
  })
})

const mockRuntimeClient = createClient()
const mockRuntimeLoaded = jest.fn()
jest.mock('@/lib/posthogRuntime', () => {
  mockRuntimeLoaded()
  return {
    __esModule: true,
    default: mockRuntimeClient,
    postHogMonitoringExtensions: {},
  }
})

describe('authenticated analytics lifecycle', () => {
  const originalToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
  const originalHost = process.env.NEXT_PUBLIC_POSTHOG_HOST

  beforeAll(() => {
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = 'test-token'
    process.env.NEXT_PUBLIC_POSTHOG_HOST = 'https://analytics.example.com'
  })
  afterAll(() => {
    if (originalToken === undefined)
      delete process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
    else process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = originalToken
    if (originalHost === undefined) delete process.env.NEXT_PUBLIC_POSTHOG_HOST
    else process.env.NEXT_PUBLIC_POSTHOG_HOST = originalHost
  })

  it('does not load the SDK or retain signed-out activity for a later login', async () => {
    await initializePostHog(null)
    capturePostHogEvent('archive_deleted')
    await Promise.resolve()
    expect(mockRuntimeLoaded).not.toHaveBeenCalled()
    expect(mockRuntimeClient.capture).not.toHaveBeenCalled()
    const beforeSend = createPostHogConfig('https://analytics.example.com')
      .before_send as (event: CaptureResult) => CaptureResult | null
    expect(
      beforeSend(captureResult('$pageview', { distinct_id: 'stale-user' })),
    ).toBeNull()
  })

  it('does not initialize when logout races the SDK import', async () => {
    const pending = initializePostHog(sessionFor('old-user'))
    await initializePostHog(null)
    await pending
    expect(mockRuntimeClient.init).not.toHaveBeenCalled()
    expect(mockRuntimeClient.opt_in_capturing).not.toHaveBeenCalled()
  })

  it('tracks authenticated users, stops on logout, and supports another login', async () => {
    await initializePostHog(sessionFor('user-123'))
    expect(mockRuntimeClient.init).toHaveBeenCalledWith(
      'test-token',
      expect.objectContaining({
        opt_out_capturing_by_default: true,
        bootstrap: { distinctID: 'user-123', isIdentifiedID: true },
      }),
    )
    expect(mockRuntimeClient.identify).toHaveBeenCalledWith(
      'user-123',
      expect.any(Object),
    )
    expect(mockRuntimeClient.opt_in_capturing).toHaveBeenCalledWith({
      captureEventName: false,
    })
    expect(mockRuntimeClient.capture).not.toHaveBeenCalledWith(
      'archive_deleted',
      expect.anything(),
    )
    const beforeSend = createPostHogConfig('https://analytics.example.com')
      .before_send as (event: CaptureResult) => CaptureResult | null
    expect(
      beforeSend(captureResult('$autocapture', { distinct_id: 'anonymous' })),
    ).toBeNull()
    expect(
      beforeSend(captureResult('$pageview', { distinct_id: 'user-123' })),
    ).not.toBeNull()
    capturePostHogEvent('archive_deleted')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(mockRuntimeClient.capture).toHaveBeenCalledWith(
      'archive_deleted',
      expect.any(Object),
    )

    await initializePostHog(null)
    expect(mockRuntimeClient.stopSessionRecording).toHaveBeenCalled()
    expect(mockRuntimeClient.opt_out_capturing).toHaveBeenCalled()
    expect(mockRuntimeClient.reset).toHaveBeenCalled()
    expect(
      beforeSend(captureResult('$snapshot', { distinct_id: 'user-123' })),
    ).toBeNull()
    mockRuntimeClient.capture.mockClear()
    capturePostHogEvent('archive_deleted')
    await Promise.resolve()
    expect(mockRuntimeClient.capture).not.toHaveBeenCalled()

    await initializePostHog(sessionFor('second-user'))
    expect(mockRuntimeClient.init).toHaveBeenCalledTimes(1)
    expect(mockRuntimeClient.startSessionRecording).toHaveBeenCalledTimes(2)
    expect(mockRuntimeClient.identify).toHaveBeenLastCalledWith(
      'second-user',
      expect.any(Object),
    )
    expect(
      beforeSend(captureResult('$pageview', { distinct_id: 'user-123' })),
    ).toBeNull()
    expect(
      beforeSend(captureResult('$pageview', { distinct_id: 'second-user' })),
    ).not.toBeNull()
    await initializePostHog(null)
  })
})
