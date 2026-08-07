import type { Session } from '@supabase/supabase-js'
import type { CaptureResult, PostHog } from 'posthog-js/dist/module.slim'
import {
  capturePostHogEventWhenReady,
  capturePostHogEventWithClient,
  createPostHogConfig,
  initializePostHogClient,
  sanitizePostHogEvent,
  syncPostHogIdentity,
} from './posthog'

type TestPostHogClient = Pick<
  PostHog,
  'capture' | 'identify' | 'init' | 'reset'
>

function createClient(): jest.Mocked<TestPostHogClient> {
  return {
    capture: jest.fn(),
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
          identity_data: { user_name: 'archive_user' },
        },
      ],
    },
  } as unknown as Session
}

describe('sanitizePostHogEvent', () => {
  it('keeps only required SDK and event-specific aggregate properties', () => {
    const event = captureResult('archive_search_submitted', {
      token: 'project-token',
      distinct_id: 'user-123',
      has_query: true,
      active_filter_count: 2,
      $current_url: 'https://example.com/search?q=private-words',
      $session_entry_url: 'https://example.com/search?q=private-words',
      query: 'private-words',
      email: 'private@example.com',
    })

    expect(sanitizePostHogEvent(event)?.properties).toEqual({
      $geoip_disable: true,
      token: 'project-token',
      distinct_id: 'user-123',
      has_query: true,
      active_filter_count: 2,
    })
  })

  it('keeps only the public username on identify events', () => {
    const event = {
      ...captureResult('$identify', {
        token: 'project-token',
        distinct_id: 'user-123',
        $anon_distinct_id: 'anonymous-123',
        $current_url: 'https://example.com/search?q=private-words',
      }),
      $set: {
        username: 'archive_user',
        email: 'private@example.com',
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
      $set: { username: 'archive_user' },
    })
    expect(sanitizePostHogEvent(event)?.$set_once).toBeUndefined()
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

  it('drops an invalid identify username', () => {
    const event = {
      ...captureResult('$identify', {
        token: 'project-token',
        distinct_id: 'user-123',
      }),
      $set: { username: 'not a valid X username' },
    }

    expect(sanitizePostHogEvent(event)?.$set).toBeUndefined()
  })

  it('rejects SDK-generated events that are not explicitly allowed', () => {
    expect(sanitizePostHogEvent(captureResult('$pageview', {}))).toBeNull()
  })
})

describe('createPostHogConfig', () => {
  it('disables passive collection, persistence, and remote features', () => {
    expect(createPostHogConfig('https://analytics.example.com')).toMatchObject({
      api_host: 'https://analytics.example.com',
      advanced_disable_flags: true,
      autocapture: false,
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
      respect_dnt: true,
      save_campaign_params: false,
      save_referrer: false,
    })
  })
})

describe('initializePostHogClient', () => {
  it('is optional when public environment variables are missing', () => {
    const client = createClient()

    expect(initializePostHogClient(client, undefined, undefined)).toBe(false)
    expect(client.init).not.toHaveBeenCalled()
  })

  it('initializes a configured client with the privacy-safe config', () => {
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
        disable_persistence: true,
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
      }),
    ).toBe(true)
    expect(client.capture).toHaveBeenCalledWith('archive_search_submitted', {
      has_query: true,
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
      { bucket: 'month' },
    )
    expect(client.capture).not.toHaveBeenCalled()

    resolveClient(client)

    await expect(capturePromise).resolves.toBe(true)
    expect(client.capture).toHaveBeenCalledWith('word_trend_requested', {
      bucket: 'month',
    })
  })

  it('waits for auth identity before sending a linked event', async () => {
    const client = createClient()
    let resolveIdentity: () => void = () => undefined
    const identityPromise = new Promise<void>((resolve) => {
      resolveIdentity = resolve
    })

    const capturePromise = capturePostHogEventWhenReady(
      () => Promise.resolve(client),
      () => identityPromise,
      'archive_deleted',
    )
    await Promise.resolve()
    expect(client.capture).not.toHaveBeenCalled()

    resolveIdentity()

    await expect(capturePromise).resolves.toBe(true)
    expect(client.capture).toHaveBeenCalledWith('archive_deleted', undefined)
  })
})

describe('syncPostHogIdentity', () => {
  const identify = jest.fn()
  const reset = jest.fn()
  const actions = { identify, reset }

  beforeEach(() => {
    identify.mockReset()
    reset.mockReset()
  })

  it('identifies an initial signed-in user by ID and public username', () => {
    expect(
      syncPostHogIdentity(
        'INITIAL_SESSION',
        sessionFor('user-123'),
        null,
        actions,
      ),
    ).toBe('user-123')
    expect(reset).toHaveBeenCalledTimes(1)
    expect(identify).toHaveBeenCalledWith('user-123', {
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
})
