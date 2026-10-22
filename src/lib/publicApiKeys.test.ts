import { createHash } from 'node:crypto'
import type { User } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import { GET, POST } from '@/app/api/settings/api-keys/route'
import { DELETE } from '@/app/api/settings/api-keys/[key_id]/route'
import { POST as verify } from '@/app/api/internal/public-api/keys/verify/route'
import { getCurrentUser } from '@/lib/portal/auth'
import { createServerServiceRoleClient } from '@/utils/supabase'
import {
  createPublicApiKey,
  generatePublicApiKey,
  isVerifierAuthorized,
  normalizeKeyLabel,
  PublicApiKeyError,
} from './publicApiKeys'

jest.mock('@/lib/portal/auth', () => ({ getCurrentUser: jest.fn() }))
jest.mock('@/utils/supabase', () => ({
  createServerServiceRoleClient: jest.fn(),
}))

// The gateway's parser (ops/clickhouse-query-gateway/public-api-auth.ts).
const GATEWAY_KEY_PATTERN = /^cak_([a-z0-9]{16})_([A-Za-z0-9_-]{43})$/
const ORIGIN = 'https://www.community-archive.org'
const VERIFIER_TOKEN = 'v'.repeat(43)
const user = {
  id: '11111111-1111-4111-8111-111111111111',
  app_metadata: { provider_id: '322603863' },
  user_metadata: { provider_id: '999' },
} as unknown as User
const summary = {
  id: 'abcdefgh23456789',
  label: 'search app',
  scopes: ['corpus:read'],
  requests_per_minute: 60,
  requests_per_day: 20000,
  created_at: '2026-10-16T12:00:00Z',
  expires_at: null,
  last_used_at: null,
  revoked_at: null,
}

const rpc = jest.fn()

function jsonRequest(
  path: string,
  method: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return new NextRequest(`${ORIGIN}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', origin: ORIGIN, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.PUBLIC_API_KEY_VERIFIER_TOKEN = VERIFIER_TOKEN
  jest.mocked(getCurrentUser).mockResolvedValue(user)
  jest.mocked(createServerServiceRoleClient).mockReturnValue({ rpc } as never)
})

describe('key material', () => {
  test('generated keys match the gateway format and hash the whole key', () => {
    for (let index = 0; index < 50; index += 1) {
      const { keyId, key, keySha256 } = generatePublicApiKey()
      const match = GATEWAY_KEY_PATTERN.exec(key)
      expect(match?.[1]).toBe(keyId)
      expect(keySha256).toBe(createHash('sha256').update(key).digest('hex'))
    }
  })

  test('key IDs and secrets come from independent random draws', () => {
    const draws: number[] = []
    const random = (size: number) => {
      draws.push(size)
      return Buffer.alloc(size, 0xff)
    }
    const { keyId, key } = generatePublicApiKey(random)
    expect(draws).toEqual([10, 32])
    expect(keyId).toBe('7777777777777777')
    expect(key).toBe(
      `cak_${keyId}_${Buffer.alloc(32, 0xff).toString('base64url')}`,
    )
  })

  test('labels are optional, trimmed, and bounded', () => {
    expect(normalizeKeyLabel(undefined)).toBeNull()
    expect(normalizeKeyLabel('   ')).toBeNull()
    expect(normalizeKeyLabel('  my   app ')).toBe('my app')
    expect(() => normalizeKeyLabel('x'.repeat(81))).toThrow(PublicApiKeyError)
    expect(() => normalizeKeyLabel(42)).toThrow(PublicApiKeyError)
  })

  test('the verifier bearer is compared exactly and must be long', () => {
    expect(isVerifierAuthorized(`Bearer ${VERIFIER_TOKEN}`)).toBe(true)
    expect(isVerifierAuthorized(`Bearer ${VERIFIER_TOKEN}x`)).toBe(false)
    expect(isVerifierAuthorized(VERIFIER_TOKEN)).toBe(false)
    expect(isVerifierAuthorized(null)).toBe(false)
    process.env.PUBLIC_API_KEY_VERIFIER_TOKEN = 'short'
    expect(isVerifierAuthorized('Bearer short')).toBe(false)
  })

  test('stores only the hash and the trusted account ID', async () => {
    rpc.mockResolvedValueOnce({ data: summary, error: null })
    const created = await createPublicApiKey(user, 'search app')
    expect(rpc).toHaveBeenCalledWith('create_public_api_key', {
      owner_user_id: user.id,
      owner_account_id: '322603863',
      new_key_id: expect.stringMatching(/^[a-z2-7]{16}$/),
      new_key_sha256: createHash('sha256').update(created.key).digest('hex'),
      key_label: 'search app',
    })
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(created.key)
  })
})

describe('owner routes', () => {
  test('creating a key returns it once, uncached', async () => {
    rpc.mockResolvedValueOnce({ data: summary, error: null })
    const response = await POST(
      jsonRequest('/api/settings/api-keys', 'POST', { label: 'search app' }),
    )
    expect(response.status).toBe(201)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    const body = await response.json()
    expect(body.key.key).toMatch(GATEWAY_KEY_PATTERN)
    expect(body.key.id).toBe(summary.id)
  })

  test('creation rejects cross-origin requests before reading the session', async () => {
    const response = await POST(
      jsonRequest(
        '/api/settings/api-keys',
        'POST',
        {},
        { origin: 'https://evil.example' },
      ),
    )
    expect(response.status).toBe(403)
    expect(getCurrentUser).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  test('creation requires a signed-in user', async () => {
    jest.mocked(getCurrentUser).mockResolvedValueOnce(null)
    expect(
      (await POST(jsonRequest('/api/settings/api-keys', 'POST', {}))).status,
    ).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
  })

  test.each([
    ['active_key_limit', 409],
    ['daily_creation_limit', 429],
    ['api_access_suspended', 403],
    ['connection refused', 503],
  ])('maps the registry error %s to %i', async (message, status) => {
    rpc.mockResolvedValueOnce({ data: null, error: { message } })
    const response = await POST(
      jsonRequest('/api/settings/api-keys', 'POST', {}),
    )
    expect(response.status).toBe(status)
    expect((await response.json()).error).toBeTruthy()
  })

  test('an invalid label is a 400 without a database call', async () => {
    const response = await POST(
      jsonRequest('/api/settings/api-keys', 'POST', { label: 'x'.repeat(81) }),
    )
    expect(response.status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  test('listing shows only the signed-in owner', async () => {
    rpc.mockResolvedValueOnce({ data: [summary], error: null })
    const response = await GET()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ keys: [summary] })
    expect(rpc).toHaveBeenCalledWith('list_public_api_keys', {
      owner_user_id: user.id,
    })
    jest.mocked(getCurrentUser).mockResolvedValueOnce(null)
    expect((await GET()).status).toBe(401)
  })

  test('revocation is owner-scoped and same-origin', async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null })
    const params = { params: { key_id: summary.id } }
    const ok = await DELETE(
      jsonRequest(`/api/settings/api-keys/${summary.id}`, 'DELETE'),
      params,
    )
    expect(ok.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('revoke_public_api_key', {
      owner_user_id: user.id,
      target_key_id: summary.id,
    })
    rpc.mockResolvedValueOnce({ data: false, error: null })
    expect(
      (
        await DELETE(
          jsonRequest(`/api/settings/api-keys/${summary.id}`, 'DELETE'),
          params,
        )
      ).status,
    ).toBe(404)
    expect(
      (
        await DELETE(
          jsonRequest(
            `/api/settings/api-keys/${summary.id}`,
            'DELETE',
            undefined,
            { origin: 'https://evil.example' },
          ),
          params,
        )
      ).status,
    ).toBe(403)
    expect(
      (
        await DELETE(
          jsonRequest('/api/settings/api-keys/NOT-AN-ID', 'DELETE'),
          {
            params: { key_id: 'NOT-AN-ID' },
          },
        )
      ).status,
    ).toBe(404)
    expect(rpc).toHaveBeenCalledTimes(2)
  })
})

describe('gateway verifier route', () => {
  const sha = 'a'.repeat(64)
  const verifyRequest = (body: unknown, token = VERIFIER_TOKEN) =>
    jsonRequest('/api/internal/public-api/keys/verify', 'POST', body, {
      authorization: `Bearer ${token}`,
      origin: '',
    })

  test('requires the server-to-server bearer token', async () => {
    const response = await verify(
      verifyRequest({ key_id: summary.id, key_sha256: sha }, 'w'.repeat(43)),
    )
    expect(response.status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
  })

  test('malformed lookups are invalid without a database call', async () => {
    const response = await verify(
      verifyRequest({ key_id: 'X', key_sha256: 'nope' }),
    )
    expect(await response.json()).toEqual({ valid: false })
    expect(rpc).not.toHaveBeenCalled()
  })

  test('returns the registry answer for a well-formed lookup', async () => {
    const answer = {
      valid: true,
      key: {
        id: summary.id,
        consumer_id: '6f1c2b8e-3d4a-4f5b-9c6d-7e8f9a0b1c2d',
        scopes: ['corpus:read'],
        requests_per_minute: 60,
        requests_per_day: 20000,
        expires_at: null,
      },
    }
    rpc.mockResolvedValueOnce({ data: answer, error: null })
    const response = await verify(
      verifyRequest({ key_id: summary.id, key_sha256: sha }),
    )
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual(answer)
    expect(rpc).toHaveBeenCalledWith('verify_public_api_key', {
      target_key_id: summary.id,
      presented_key_sha256: sha,
    })
  })

  test('a registry failure is a 503 so the gateway fails closed', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'timeout' } })
    expect(
      (await verify(verifyRequest({ key_id: summary.id, key_sha256: sha })))
        .status,
    ).toBe(503)
  })
})
