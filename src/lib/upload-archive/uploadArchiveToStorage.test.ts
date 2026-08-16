import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { Archive } from '../types'
import { refreshSession } from '../refreshSession'
import { uploadArchiveToStorage } from './uploadArchiveToStorage'

jest.mock('../refreshSession', () => ({
  refreshSession: jest.fn(),
}))

const mockedRefreshSession = jest.mocked(refreshSession)

const createArchive = (username: string) =>
  ({
    account: [{ account: { username, accountId: 'twitter-123' } }],
  }) as unknown as Archive

const createTwitterUser = (username: string) =>
  ({
    id: 'auth-user-1',
    app_metadata: {
      user_name: username.toLowerCase(),
      provider_id: 'twitter-123',
    },
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2026-08-10T00:00:00.000Z',
    identities: [
      {
        id: 'twitter-123',
        identity_id: 'twitter-identity-1',
        user_id: 'auth-user-1',
        identity_data: { user_name: username },
        provider: 'twitter',
        created_at: '2026-08-10T00:00:00.000Z',
        updated_at: '2026-08-10T00:00:00.000Z',
        last_sign_in_at: '2026-08-10T00:00:00.000Z',
      },
    ],
  }) as User

const createSupabase = (
  getUserResult: unknown,
  policyResult: unknown = { data: true, error: null },
) => {
  const upload = jest.fn().mockResolvedValue({ data: {}, error: null })
  const from = jest.fn().mockReturnValue({ upload })
  const getUser = jest.fn().mockResolvedValue(getUserResult)
  const rpc = jest.fn().mockResolvedValue(policyResult)
  const supabase = {
    auth: { getUser },
    storage: { from },
    rpc,
  } as unknown as SupabaseClient

  return { supabase, getUser, from, upload, rpc }
}

describe('uploadArchiveToStorage', () => {
  beforeEach(() => {
    mockedRefreshSession.mockResolvedValue(undefined)
  })

  it('keys the object path from the verified Twitter identity', async () => {
    const archive = createArchive('client_supplied_victim')
    const { supabase, getUser, from, upload, rpc } = createSupabase({
      data: { user: createTwitterUser('Verified_Owner') },
      error: null,
    })

    await uploadArchiveToStorage(supabase, archive)

    expect(getUser).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('assert_archive_upload_allowed', {
      p_account_id: 'twitter-123',
      p_username: 'verified_owner',
    })
    expect(from).toHaveBeenCalledWith('archives')
    expect(upload).toHaveBeenCalledWith(
      'verified_owner/archive.json',
      JSON.stringify(archive),
      { upsert: true },
    )
  })

  it('rejects a session without a trusted identity username', async () => {
    const user = {
      ...createTwitterUser('verified_owner'),
      app_metadata: {},
      identities: [],
      user_metadata: { user_name: 'client_supplied_victim' },
    } as User
    const { supabase, upload } = createSupabase({
      data: { user },
      error: null,
    })

    await expect(
      uploadArchiveToStorage(supabase, createArchive('victim')),
    ).rejects.toThrow('Unable to determine a trusted username')
    expect(upload).not.toHaveBeenCalled()
  })

  it('does not upload when Supabase cannot verify the session', async () => {
    const { supabase, upload } = createSupabase({
      data: { user: null },
      error: { message: 'invalid access token' },
    })

    await expect(
      uploadArchiveToStorage(supabase, createArchive('victim')),
    ).rejects.toThrow('Unable to verify the archive owner')
    expect(upload).not.toHaveBeenCalled()
  })

  it('does not upload when PostgreSQL reports a policy block', async () => {
    const { supabase, upload } = createSupabase(
      {
        data: { user: createTwitterUser('blocked_owner') },
        error: null,
      },
      { data: null, error: { message: 'archive owner is blocked' } },
    )

    await expect(
      uploadArchiveToStorage(supabase, createArchive('blocked_owner')),
    ).rejects.toThrow('Archive upload blocked by policy')
    expect(upload).not.toHaveBeenCalled()
  })
})
