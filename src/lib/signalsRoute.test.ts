import { NextRequest } from 'next/server'
import { POST } from '@/app/api/signals/[source]/route'
import { upsertSignalIssues } from '@/lib/signals/github'

jest.mock('@/lib/signals/github', () => {
  const actual = jest.requireActual('@/lib/signals/github')
  return { ...actual, upsertSignalIssues: jest.fn() }
})

const upsertMock = upsertSignalIssues as jest.MockedFunction<
  typeof upsertSignalIssues
>

const params = (source: string) => ({ params: Promise.resolve({ source }) })

function post(
  source: string,
  body: string,
  headers: Record<string, string> = {},
) {
  return POST(
    new NextRequest(`https://community-archive.org/api/signals/${source}`, {
      method: 'POST',
      body,
      headers,
    }),
    params(source),
  )
}

describe('signals route', () => {
  const env = { ...process.env }
  beforeEach(() => {
    upsertMock.mockReset()
    process.env.SIGNALS_WEBHOOK_SECRET = 'hook'
    process.env.SIGNALS_GITHUB_TOKEN = 'gh'
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    process.env = { ...env }
    jest.restoreAllMocks()
  })

  test('rejects unknown sources and missing auth', async () => {
    expect(
      (await post('slack', '{}', { authorization: 'Bearer hook' })).status,
    ).toBe(404)
    expect((await post('grafana', '{"alerts":[]}')).status).toBe(401)
    expect(
      (
        await post('grafana', '{"alerts":[]}', {
          authorization: 'Bearer wrong',
        })
      ).status,
    ).toBe(401)
    expect(upsertMock).not.toHaveBeenCalled()
  })

  test('routes grafana alerts to issues and reports outcomes', async () => {
    upsertMock.mockResolvedValue([
      { fingerprint: 'x', action: 'created', number: 1, url: 'u' },
    ])
    const response = await post(
      'grafana',
      JSON.stringify({
        alerts: [
          { status: 'firing', labels: { alertname: 'endpoint health' } },
        ],
      }),
      { authorization: 'Bearer hook' },
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      accepted: 1,
      routed: true,
      outcomes: [{ fingerprint: 'x', action: 'created', number: 1, url: 'u' }],
    })
    expect(upsertMock.mock.calls[0][1][0]).toMatchObject({
      source: 'grafana',
      title: 'endpoint health',
    })
  })

  test('accepts and logs when no GitHub token is configured', async () => {
    delete process.env.SIGNALS_GITHUB_TOKEN
    const response = await post('generic', JSON.stringify({ title: 'hello' }), {
      authorization: 'Bearer hook',
    })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      accepted: 1,
      routed: false,
    })
    expect(upsertMock).not.toHaveBeenCalled()
  })

  test('returns 400 on unreadable JSON and 502 with a request id when GitHub fails', async () => {
    expect(
      (await post('posthog', '{not json', { authorization: 'Bearer hook' }))
        .status,
    ).toBe(400)
    upsertMock.mockRejectedValue(new Error('GitHub POST failed: 500'))
    const response = await post('generic', JSON.stringify({ title: 'x' }), {
      authorization: 'Bearer hook',
    })
    expect(response.status).toBe(502)
    const body = await response.json()
    expect(body.error).toBe('Could not file the signal')
    expect(typeof body.request_id).toBe('string')
  })
})
