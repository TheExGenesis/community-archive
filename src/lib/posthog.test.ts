import type { Session } from '@supabase/supabase-js'
import type {
  CaptureResult,
  PostHog,
  PostHogConfig,
} from 'posthog-js/dist/module.slim'
import {
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
  'capture' | 'get_property' | 'identify' | 'init' | 'reset'
>

function createClient(): jest.Mocked<TestPostHogClient> {
  return {
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
      $current_url: 'https://example.com/search?q=private-words',
      $session_entry_url: 'https://example.com/search?q=private-words',
      utm_campaign: 'archive-launch',
      query: 'private-words',
      email: 'private@example.com',
    })

    expect(sanitizePostHogEvent(event)?.properties).toEqual({
      $geoip_disable: true,
      token: 'project-token',
      distinct_id: 'user-123',
      $current_url: 'https://example.com/search?q=private-words',
      $session_entry_url: 'https://example.com/search?q=private-words',
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
        destination: 'data_export',
        surface: 'card',
        external: true,
      },
    ],
    [
      'tweet_card_action',
      {
        action: 'expand',
        origin: 'bangers',
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
    ['portal_stream_loaded_more', { loaded_tweet_count: 30, has_more: true }],
  ])('keeps aggregate properties for %s', (eventName, properties) => {
    const event = captureResult(eventName, {
      ...properties,
      query: 'do not send this',
      tweet_id: '1234567890',
    })

    expect(sanitizePostHogEvent(event)?.properties).toEqual({
      $geoip_disable: true,
      ...properties,
    })
  })

  it('keeps the supported signed-in identity properties', () => {
    const event = {
      ...captureResult('$identify', {
        token: 'project-token',
        distinct_id: 'user-123',
        $anon_distinct_id: 'anonymous-123',
        $current_url: 'https://example.com/search?q=private-words',
      }),
      $set: {
        username: 'archive_user',
        email: 'archive@example.com',
        name: 'Archive User',
        secret: 'not-a-person-property',
      },
      $set_once: {
        $initial_current_url: 'https://example.com/search?q=private-words',
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
        $initial_current_url: 'https://example.com/search?q=private-words',
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
      $current_url: 'https://example.com/search?q=public-query',
      $referrer: 'https://example.org/',
      $geoip_disable: true,
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
        maskAllInputs: false,
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
  const actions = { identify, reset, getPersistedUserId }

  beforeEach(() => {
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
