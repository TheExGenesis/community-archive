import type { SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'
import { getSessionTwitterUsername } from '@/lib/sessionTwitterUsername'
import { createServerClient } from '@/utils/supabase'
import { GET } from './route'

jest.mock('next/headers', () => ({ cookies: jest.fn() }))
jest.mock('@/utils/supabase', () => ({ createServerClient: jest.fn() }))
jest.mock('@/lib/sessionTwitterUsername', () => ({
  getSessionTwitterUsername: jest.fn(),
}))

const mockedCookies = jest.mocked(cookies)
const mockedCreateServerClient = jest.mocked(createServerClient)
const mockedUsername = jest.mocked(getSessionTwitterUsername)

function client(options: {
  user?: Record<string, unknown> | null
  policyError?: { message: string } | null
}) {
  const createSignedUrl = jest.fn().mockResolvedValue({
    data: { signedUrl: 'https://storage.example/signed' },
    error: null,
  })
  const rpc = jest.fn().mockResolvedValue({
    data: options.policyError ? null : true,
    error: options.policyError ?? null,
  })
  const value = {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: options.user ?? null },
        error: null,
      }),
    },
    rpc,
    storage: { from: jest.fn().mockReturnValue({ createSignedUrl }) },
  } as unknown as SupabaseClient
  mockedCreateServerClient.mockReturnValue(value)
  return { createSignedUrl, rpc }
}

describe('private archive download route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedCookies.mockReturnValue({} as ReturnType<typeof cookies>)
  })

  it('does not issue a signed URL for a different account', async () => {
    mockedUsername.mockReturnValue('signed_in_owner')
    const { createSignedUrl, rpc } = client({
      user: { app_metadata: { provider_id: 'owner-id' } },
    })

    const response = await GET({} as NextRequest, {
      params: { username: 'someone_else' },
    })

    expect(response.status).toBe(404)
    expect(rpc).not.toHaveBeenCalled()
    expect(createSignedUrl).not.toHaveBeenCalled()
  })

  it('does not issue a signed URL when current PostgreSQL policy blocks the owner', async () => {
    mockedUsername.mockReturnValue('blocked_owner')
    const { createSignedUrl, rpc } = client({
      user: { app_metadata: { provider_id: 'blocked-id' } },
      policyError: { message: 'archive owner is blocked' },
    })

    const response = await GET({} as NextRequest, {
      params: { username: 'blocked_owner' },
    })

    expect(response.status).toBe(404)
    expect(rpc).toHaveBeenCalledWith('assert_archive_upload_allowed', {
      p_account_id: 'blocked-id',
      p_username: 'blocked_owner',
    })
    expect(createSignedUrl).not.toHaveBeenCalled()
  })

  it('issues a short-lived URL only to the matching allowed owner', async () => {
    mockedUsername.mockReturnValue('allowed_owner')
    const { createSignedUrl } = client({
      user: { app_metadata: { provider_id: 'allowed-id' } },
    })

    const response = await GET({} as NextRequest, {
      params: { username: 'Allowed_Owner' },
    })

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(
      'https://storage.example/signed',
    )
    expect(createSignedUrl).toHaveBeenCalledWith(
      'allowed_owner/archive.json',
      60,
    )
  })
})
