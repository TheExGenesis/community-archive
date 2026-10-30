import {
  parseVercelDrainBody,
  signalsFromGeneric,
  signalsFromGrafana,
  signalsFromPostHog,
  signalsFromVercel,
} from './adapters'
import {
  bearerMatches,
  signalRequestAuthorized,
  vercelSignatureMatches,
} from './auth'
import {
  fingerprintFromText,
  routePattern,
  signalFingerprint,
} from './fingerprint'
import {
  signalIssueBody,
  signalIssueTitle,
  upsertSignalIssues,
  type SignalIssueConfig,
} from './github'
import type { Signal } from './types'
import { createHmac } from 'node:crypto'

describe('fingerprint', () => {
  test('is stable, source-scoped and whitespace/case insensitive', () => {
    expect(signalFingerprint('vercel', '/api/x|502|Error')).toHaveLength(12)
    expect(signalFingerprint('vercel', ' /API/x|502|error ')).toBe(
      signalFingerprint('vercel', '/api/x|502|Error'),
    )
    expect(signalFingerprint('grafana', 'k')).not.toBe(
      signalFingerprint('vercel', 'k'),
    )
  })

  test('routePattern collapses ids and strips queries', () => {
    expect(routePattern('/api/tweets/1234567890/likes?x=1')).toBe(
      '/api/tweets/:id/likes',
    )
    expect(
      routePattern('/api/digest/0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b/view'),
    ).toBe('/api/digest/:id/view')
    expect(routePattern('/api/hex-map/heat')).toBe('/api/hex-map/heat')
  })

  test('marker round-trips through an issue body', () => {
    const fp = signalFingerprint('posthog', 'issue-1')
    expect(fingerprintFromText(`text\n<!-- fp:${fp} -->`)).toBe(fp)
    expect(fingerprintFromText('nothing here')).toBeNull()
  })
})

describe('adapters', () => {
  test('posthog issue payload becomes one firing signal keyed by issue id', () => {
    const [signal] = signalsFromPostHog({
      issue: {
        id: 'abc',
        name: 'TypeError: x is undefined',
        url: 'https://ph/issue/abc',
      },
      occurrences: 7,
      route: '/user/123456789',
      side: 'server',
    })
    expect(signal).toMatchObject({
      source: 'posthog',
      title: 'TypeError: x is undefined',
      state: 'firing',
      occurrences: 7,
      route: '/user/:id',
      link: 'https://ph/issue/abc',
      fingerprint: signalFingerprint('posthog', 'abc'),
    })
    expect(signalsFromPostHog({ nothing: true })).toEqual([])
  })

  test('grafana alerts map severity, state and labels', () => {
    const signals = signalsFromGrafana({
      alerts: [
        {
          status: 'firing',
          fingerprint: 'g1',
          labels: {
            alertname: 'endpoint health',
            instance: 'prod-firehose',
            severity: 'critical',
          },
          annotations: { summary: 'ClickHouse gateway down' },
          startsAt: '2026-10-29T01:00:00Z',
          panelURL: 'https://grafana/p',
        },
        {
          status: 'resolved',
          fingerprint: 'g2',
          labels: { alertname: 'systemd' },
        },
      ],
    })
    expect(signals).toHaveLength(2)
    expect(signals[0]).toMatchObject({
      source: 'grafana',
      title: 'endpoint health on prod-firehose',
      severity: 'critical',
      state: 'firing',
      link: 'https://grafana/p',
      summary: 'ClickHouse gateway down',
      fingerprint: signalFingerprint('grafana', 'g1'),
    })
    expect(signals[1]).toMatchObject({ state: 'resolved', severity: 'warning' })
    expect(signalsFromGrafana({ alerts: 'nope' })).toEqual([])
  })

  test('vercel drain keeps only 5xx and error lines, grouped per route', () => {
    const body = JSON.stringify([
      {
        path: '/api/tweet-search?q=a',
        statusCode: 502,
        source: 'lambda',
        timestamp: 1700000000000,
      },
      { path: '/api/tweet-search?q=b', statusCode: 502, source: 'lambda' },
      { path: '/api/tweet-search', statusCode: 200, source: 'lambda' },
      { path: '/_next/static/x.js', statusCode: 500, source: 'static' },
      {
        path: '/api/portal/stream',
        statusCode: 502,
        source: 'lambda',
        message:
          'ERROR {"level":"error","kind":"api_error","route":"/api/portal/stream","status":502,"upstream":"gateway","error":{"name":"FetchError","message":"timeout"},"message":"The live stream is temporarily unavailable","request_id":"iad1::abc","user_state":"guest"}',
      },
    ])
    const signals = signalsFromVercel(parseVercelDrainBody(body))
    expect(signals).toHaveLength(2)
    expect(signals[0]).toMatchObject({
      route: '/api/tweet-search',
      occurrences: 2,
      firstSeen: '2023-11-14T22:13:20.000Z',
      severity: 'critical',
    })
    expect(signals[1]).toMatchObject({
      route: '/api/portal/stream',
      title: '502 on /api/portal/stream (gateway)',
      details: {
        upstream: 'gateway',
        error_name: 'FetchError',
        request_id: 'iad1::abc',
        user_state: 'guest',
      },
    })
  })

  test('vercel drain accepts NDJSON and ignores junk lines', () => {
    const logs = parseVercelDrainBody(
      '{"path":"/a","statusCode":500}\nnot json\n{"path":"/b","statusCode":200}',
    )
    expect(logs).toHaveLength(2)
  })

  test('generic accepts one or many and restricts the source', () => {
    const signals = signalsFromGeneric(
      [
        {
          title: 'Autorefresh run dropped 40% of tweets',
          key: 'drop-rate',
          severity: 'critical',
          details: { dropped: 0.4 },
        },
        { title: 'bad source', source: 'posthog' },
        { nope: true },
      ],
      'autorefresh',
    )
    expect(signals).toHaveLength(2)
    expect(signals[0]).toMatchObject({
      source: 'autorefresh',
      severity: 'critical',
      details: { dropped: 0.4 },
    })
    expect(signals[1].source).toBe('posthog')
  })
})

describe('auth', () => {
  test('bearer and vercel signature', () => {
    expect(bearerMatches('Bearer s3cret', 's3cret')).toBe(true)
    expect(bearerMatches('Bearer other', 's3cret')).toBe(false)
    expect(bearerMatches(null, 's3cret')).toBe(false)
    const body = '[{"path":"/x"}]'
    const sig = createHmac('sha1', 's3cret').update(body).digest('hex')
    expect(vercelSignatureMatches(sig, body, 's3cret')).toBe(true)
    expect(vercelSignatureMatches(sig, body + ' ', 's3cret')).toBe(false)
    const headers = new Headers({ 'x-vercel-signature': sig })
    expect(signalRequestAuthorized(headers, body, 's3cret')).toBe(true)
    expect(signalRequestAuthorized(headers, body, undefined)).toBe(false)
  })
})

describe('github upsert', () => {
  const signal: Signal = {
    source: 'grafana',
    title: 'endpoint health on prod-firehose',
    fingerprint: 'abcdef012345',
    severity: 'critical',
    state: 'firing',
    details: { alertname: 'endpoint health' },
  }

  function fakeGitHub(openIssues: Array<{ number: number; body: string }>) {
    const calls: Array<{ method: string; path: string; body?: unknown }> = []
    const fetchImpl = (async (
      url: string | URL | Request,
      init?: RequestInit,
    ) => {
      const path = String(url).replace('https://api.github.com', '')
      const method = init?.method ?? 'GET'
      calls.push({
        method,
        path,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      })
      if (method === 'GET') {
        return new Response(
          JSON.stringify(
            openIssues.map((i) => ({
              ...i,
              html_url: `https://gh/${i.number}`,
            })),
          ),
          { status: 200 },
        )
      }
      if (path.endsWith('/issues')) {
        return new Response(
          JSON.stringify({ number: 99, body: '', html_url: 'https://gh/99' }),
          { status: 201 },
        )
      }
      return new Response(JSON.stringify({ id: 1 }), { status: 201 })
    }) as typeof fetch
    const config: SignalIssueConfig = { token: 't', repo: 'o/r', fetchImpl }
    return { config, calls }
  }

  test('creates an issue with the signal label and fingerprint marker', async () => {
    const { config, calls } = fakeGitHub([])
    const outcomes = await upsertSignalIssues(config, [signal])
    expect(outcomes).toEqual([
      {
        fingerprint: signal.fingerprint,
        action: 'created',
        number: 99,
        url: 'https://gh/99',
      },
    ])
    const create = calls.find(
      (c) => c.method === 'POST' && c.path === '/repos/o/r/issues',
    )
    expect(create?.body).toMatchObject({
      title: signalIssueTitle(signal),
      labels: ['signal'],
    })
    expect((create?.body as { body: string }).body).toContain(
      `fp:${signal.fingerprint}`,
    )
    expect((create?.body as { body: string }).body).toContain('```json signal')
  })

  test('comments on the open issue with the same fingerprint instead of duplicating', async () => {
    const { config, calls } = fakeGitHub([
      { number: 7, body: signalIssueBody(signal) },
    ])
    const outcomes = await upsertSignalIssues(config, [
      signal,
      { ...signal, state: 'resolved' },
    ])
    expect(outcomes.map((o) => o.action)).toEqual(['commented', 'resolved'])
    expect(outcomes[0].number).toBe(7)
    expect(
      calls.filter(
        (c) => c.path === '/repos/o/r/issues' && c.method === 'POST',
      ),
    ).toHaveLength(0)
    expect(calls.filter((c) => c.path.endsWith('/7/comments'))).toHaveLength(2)
  })

  test('a resolved signal with no open issue is ignored', async () => {
    const { config, calls } = fakeGitHub([])
    const outcomes = await upsertSignalIssues(config, [
      { ...signal, state: 'resolved' },
    ])
    expect(outcomes).toEqual([
      { fingerprint: signal.fingerprint, action: 'ignored' },
    ])
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0)
  })

  test('two signals with the same fingerprint in one batch create one issue', async () => {
    const { config, calls } = fakeGitHub([])
    await upsertSignalIssues(config, [signal, signal])
    expect(
      calls.filter(
        (c) => c.path === '/repos/o/r/issues' && c.method === 'POST',
      ),
    ).toHaveLength(1)
  })
})
