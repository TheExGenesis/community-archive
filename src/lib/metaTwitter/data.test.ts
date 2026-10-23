const fromMock = jest.fn()
const rpcMock = jest.fn()

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: fromMock, rpc: rpcMock }),
}))

jest.mock('next/cache', () => ({
  unstable_cache: (callback: unknown) => callback,
}))

import { getCachedProfileHeader, resolvePublicProfileIdentity } from './data'

type QueryResult = { data: unknown; error: unknown }

const queryFor = (result: QueryResult) => {
  const query = {
    select: jest.fn(),
    eq: jest.fn(),
    ilike: jest.fn(),
    order: jest.fn(),
    limit: jest.fn(),
    maybeSingle: jest.fn(async () => result),
  }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  query.ilike.mockReturnValue(query)
  query.order.mockReturnValue(query)
  query.limit.mockReturnValue(query)
  return query
}

const account = {
  account_id: '42',
  username: 'alice',
  account_display_name: 'Alice',
  created_at: null,
  num_tweets: 10,
  num_followers: 20,
  num_following: 30,
  num_likes: 40,
}

const profile = {
  bio: 'Bio',
  website: null,
  location: null,
  avatar_media_url: null,
  header_media_url: null,
}

beforeEach(() => {
  fromMock.mockReset()
  rpcMock.mockReset()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://archive.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
})

test('does not infer membership from all_account presence', async () => {
  const results: Record<string, QueryResult> = {
    all_account: { data: account, error: null },
    all_profile: { data: profile, error: null },
    user_directory: { data: null, error: null },
  }
  fromMock.mockImplementation((table: string) => queryFor(results[table]))

  await expect(getCachedProfileHeader('42')).resolves.toMatchObject({
    account_id: '42',
    has_archive: false,
    is_opted_in: false,
  })
  expect(fromMock).toHaveBeenCalledWith('user_directory')
})

test('preserves authoritative uploader and opt-in flags', async () => {
  const results: Record<string, QueryResult> = {
    all_account: { data: account, error: null },
    all_profile: { data: profile, error: null },
    user_directory: {
      data: { has_archive: true, is_opted_in: true },
      error: null,
    },
  }
  fromMock.mockImplementation((table: string) => queryFor(results[table]))

  await expect(getCachedProfileHeader('42')).resolves.toMatchObject({
    has_archive: true,
    is_opted_in: true,
  })
})

test('does not turn a membership read failure into cached non-membership', async () => {
  const membershipError = { message: 'membership unavailable' }
  const results: Record<string, QueryResult> = {
    all_account: { data: account, error: null },
    all_profile: { data: profile, error: null },
    user_directory: { data: null, error: membershipError },
  }
  fromMock.mockImplementation((table: string) => queryFor(results[table]))

  await expect(getCachedProfileHeader('42')).rejects.toBe(membershipError)
})

describe('resolvePublicProfileIdentity', () => {
  test('resolves a handle through the directory RPC', async () => {
    rpcMock.mockResolvedValue({
      data: [{ account_id: '42', username: 'alice' }],
      error: null,
    })

    await expect(resolvePublicProfileIdentity('Alice')).resolves.toEqual({
      accountId: '42',
      username: 'alice',
    })
    expect(rpcMock).toHaveBeenCalledWith('resolve_directory_identity', {
      identifier: 'Alice',
    })
    expect(fromMock).not.toHaveBeenCalled()
  })

  test('returns null when the RPC finds no directory member', async () => {
    rpcMock.mockResolvedValue({ data: [], error: null })

    await expect(resolvePublicProfileIdentity('42')).resolves.toBeNull()
    expect(rpcMock).toHaveBeenCalledWith('resolve_directory_identity', {
      identifier: '42',
    })
    expect(fromMock).not.toHaveBeenCalled()
  })

  test('falls back to the directory view when the RPC is not deployed', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'function not found' },
    })
    const query = queryFor({
      data: { account_id: '42', username: 'alice' },
      error: null,
    })
    fromMock.mockReturnValue(query)

    await expect(resolvePublicProfileIdentity('alice')).resolves.toEqual({
      accountId: '42',
      username: 'alice',
    })
    expect(fromMock).toHaveBeenCalledWith('user_directory')
    expect(query.ilike).toHaveBeenCalledWith('username', 'alice')
  })

  test('propagates other RPC errors without falling back', async () => {
    const rpcError = { code: '57014', message: 'statement timeout' }
    rpcMock.mockResolvedValue({ data: null, error: rpcError })

    await expect(resolvePublicProfileIdentity('alice')).rejects.toBe(rpcError)
    expect(fromMock).not.toHaveBeenCalled()
  })

  test('keeps directory_id lookups on the view', async () => {
    const query = queryFor({
      data: { account_id: '42', username: 'alice' },
      error: null,
    })
    fromMock.mockReturnValue(query)

    await expect(resolvePublicProfileIdentity('archive:42')).resolves.toEqual({
      accountId: '42',
      username: 'alice',
    })
    expect(query.eq).toHaveBeenCalledWith('directory_id', 'archive:42')
    expect(rpcMock).not.toHaveBeenCalled()
  })
})
