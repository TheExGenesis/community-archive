import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'
import { getSessionTwitterUsername } from '@/lib/sessionTwitterUsername'
import { removeArchiveUploadObject } from '@/lib/upload-archive/removeArchiveUploadObject'
import {
  createServerClient,
  createServerServiceRoleClient,
} from '@/utils/supabase'
import { DELETE } from './route'

jest.mock('next/headers', () => ({ cookies: jest.fn() }))
jest.mock('@/utils/supabase', () => ({
  createServerClient: jest.fn(),
  createServerServiceRoleClient: jest.fn(),
}))
jest.mock('@/lib/sessionTwitterUsername', () => ({
  getSessionTwitterUsername: jest.fn(),
}))
jest.mock('@/lib/upload-archive/removeArchiveUploadObject', () => ({
  removeArchiveUploadObject: jest.fn(),
}))

const mockedCookies = jest.mocked(cookies)
const mockedCreateServerClient = jest.mocked(createServerClient)
const mockedServiceRoleClient = jest.mocked(createServerServiceRoleClient)
const mockedUsername = jest.mocked(getSessionTwitterUsername)
const mockedRemove = jest.mocked(removeArchiveUploadObject)

const owner = { id: 'user-1', app_metadata: { provider_id: 'owner-id' } }
const pinnedUpload = {
  account_id: 'owner-id',
  storage_path: `verified_owner/${'0'.repeat(8)}-0000-4000-8000-${'0'.repeat(12)}/archive.json`,
  storage_sha256: 'a'.repeat(64),
}

function setup(
  options: {
    user?: Record<string, unknown> | null
    authError?: { message: string } | null
    upload?: typeof pinnedUpload | null
    readError?: { message: string } | null
    rpcError?: { message: string } | null
  } = {},
) {
  const calls: string[] = []
  const rpc = jest.fn(async () => {
    calls.push('rpc')
    return { data: null, error: options.rpcError ?? null }
  })
  mockedCreateServerClient.mockReturnValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: options.user === undefined ? owner : options.user },
        error: options.authError ?? null,
      }),
    },
    rpc,
  } as unknown as ReturnType<typeof createServerClient>)

  const query: Record<string, jest.Mock> = {}
  for (const method of ['select', 'eq']) query[method] = jest.fn(() => query)
  query.maybeSingle = jest.fn(async () => {
    calls.push('read')
    return {
      data: options.upload === undefined ? pinnedUpload : options.upload,
      error: options.readError ?? null,
    }
  })
  const serviceClient = { from: jest.fn(() => query) }
  mockedServiceRoleClient.mockReturnValue(
    serviceClient as unknown as ReturnType<
      typeof createServerServiceRoleClient
    >,
  )
  mockedRemove.mockImplementation(async () => {
    calls.push('remove')
    return 'removed'
  })
  return { calls, rpc, query, serviceClient }
}

const remove = (id: string) => DELETE({} as NextRequest, { params: { id } })

describe('single archive deletion route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedCookies.mockReturnValue({} as ReturnType<typeof cookies>)
    mockedUsername.mockReturnValue('verified_owner')
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
    jest.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  it.each(['abc', '0', '-1', '1.5', '1e3', '9999999999999999'])(
    'rejects archive id %j before reading the session',
    async (id) => {
      setup()

      const response = await remove(id)

      expect(response.status).toBe(400)
      expect(mockedCreateServerClient).not.toHaveBeenCalled()
      expect(mockedServiceRoleClient).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['no session', null, null],
    ['an unverified session', owner, { message: 'bad jwt' }],
  ])('rejects %s without using the service role', async (_, user, error) => {
    const { rpc } = setup({ user, authError: error })

    const response = await remove('42')

    expect(response.status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
    expect(mockedServiceRoleClient).not.toHaveBeenCalled()
  })

  it('ignores a username that only user_metadata claims', async () => {
    const user = {
      id: 'user-1',
      app_metadata: { provider_id: 'owner-id' },
      user_metadata: { user_name: 'victim' },
    }
    const { rpc } = setup({ user })
    mockedUsername.mockReturnValue(null)

    const response = await remove('42')

    expect(response.status).toBe(403)
    expect(mockedUsername).toHaveBeenCalledWith(user)
    expect(rpc).not.toHaveBeenCalled()
    expect(mockedServiceRoleClient).not.toHaveBeenCalled()
  })

  it('rejects a session without a provider id', async () => {
    const { rpc } = setup({
      user: { id: 'user-1', user_metadata: { provider_id: 'owner-id' } },
    })

    const response = await remove('42')

    expect(response.status).toBe(403)
    expect(rpc).not.toHaveBeenCalled()
    expect(mockedServiceRoleClient).not.toHaveBeenCalled()
  })

  it("does not delete an upload that isn't the owner's", async () => {
    const { rpc, query } = setup({ upload: null })

    const response = await remove('42')

    expect(response.status).toBe(404)
    expect(query.eq).toHaveBeenCalledWith('id', 42)
    expect(query.eq).toHaveBeenCalledWith('account_id', 'owner-id')
    expect(mockedServiceRoleClient).toHaveBeenCalledWith({ readSource: 'app' })
    expect(rpc).not.toHaveBeenCalled()
    expect(mockedRemove).not.toHaveBeenCalled()
  })

  it('does not delete when the upload row cannot be read', async () => {
    const { rpc } = setup({ readError: { message: 'timeout' } })

    const response = await remove('42')

    expect(response.status).toBe(500)
    expect(rpc).not.toHaveBeenCalled()
    expect(mockedRemove).not.toHaveBeenCalled()
  })

  it('keeps the raw file when the database delete fails', async () => {
    setup({ rpcError: { message: 'Unauthorized' } })

    const response = await remove('42')

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to delete archive',
    })
    expect(mockedRemove).not.toHaveBeenCalled()
  })

  it('reads the row, deletes it as the user, then removes its file', async () => {
    const { calls, rpc, serviceClient } = setup()

    const response = await remove('42')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      deleted: true,
      file: 'removed',
    })
    expect(calls).toEqual(['read', 'rpc', 'remove'])
    expect(serviceClient.from).toHaveBeenCalledWith('archive_upload')
    expect(rpc).toHaveBeenCalledWith('delete_single_archive', {
      p_account_id: 'owner-id',
      p_archive_upload_id: 42,
    })
    expect(mockedRemove).toHaveBeenCalledWith(
      serviceClient,
      'verified_owner',
      pinnedUpload,
    )
  })

  it('reports when the data was deleted but the file was not', async () => {
    setup()
    mockedRemove.mockRejectedValue(new Error('storage internals'))

    const response = await remove('42')

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'Archive deleted, but its raw archive file could not be removed',
      archiveDeleted: true,
    })
  })
})
