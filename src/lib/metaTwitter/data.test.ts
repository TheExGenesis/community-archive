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

describe('header with a resolved directory identity', () => {
  const identity = { accountId: '42', username: 'alice_dev', hasArchive: true }

  function queries(optins: QueryResult[]) {
    const optinQueries = optins.map(queryFor)
    let nextOptin = 0
    fromMock.mockImplementation((table: string) => {
      if (table === 'all_account')
        return queryFor({ data: account, error: null })
      if (table === 'all_profile')
        return queryFor({ data: profile, error: null })
      if (table === 'optin') return optinQueries[nextOptin++]
      throw new Error(`Unexpected header read: ${table}`)
    })
    return optinQueries
  }

  test.each([0, 1])(
    'preserves opt-in by ID or handle (match %s) without re-reading the directory',
    async (match) => {
      const optins = queries(
        [0, 1].map((index) => ({
          data: index === match ? { id: 1 } : null,
          error: null,
        })),
      )
      await expect(
        getCachedProfileHeader('42', identity),
      ).resolves.toMatchObject({
        has_archive: true,
        is_opted_in: true,
      })
      expect(optins[0].eq).toHaveBeenCalledWith('twitter_user_id', '42')
      expect(optins[1].ilike).toHaveBeenCalledWith('username', 'alice\\_dev')
      for (const query of optins) {
        expect(query.eq).toHaveBeenCalledWith('opted_in', true)
        expect(query.limit).toHaveBeenCalledWith(1)
      }
    },
  )

  test('keeps an archive-only member opted out of streaming', async () => {
    queries([
      { data: null, error: null },
      { data: null, error: null },
    ])
    await expect(getCachedProfileHeader('42', identity)).resolves.toMatchObject(
      {
        has_archive: true,
        is_opted_in: false,
      },
    )
  })

  test('uses the directory decision for an opt-in-only member', async () => {
    queries([])
    await expect(
      getCachedProfileHeader('42', { ...identity, hasArchive: false }),
    ).resolves.toMatchObject({ has_archive: false, is_opted_in: true })
    expect(fromMock.mock.calls.map(([table]) => table)).toEqual([
      'all_account',
      'all_profile',
    ])
  })

  test('does not cache an opt-in lookup error as a false flag', async () => {
    const error = { message: 'opt-in read failed' }
    queries([
      { data: null, error },
      { data: null, error: null },
    ])
    await expect(getCachedProfileHeader('42', identity)).rejects.toBe(error)
  })

  test('does not apply another account’s membership to this header', async () => {
    fromMock.mockImplementation((table: string) =>
      queryFor({
        data:
          table === 'all_account'
            ? account
            : table === 'all_profile'
              ? profile
              : null,
        error: null,
      }),
    )
    await expect(
      getCachedProfileHeader('42', { ...identity, accountId: '77' }),
    ).resolves.toMatchObject({ has_archive: false, is_opted_in: false })
    expect(fromMock).toHaveBeenCalledWith('user_directory')
  })
})

describe('resolvePublicProfileIdentity', () => {
  test('resolves a handle through the bounded live membership RPC', async () => {
    rpcMock.mockResolvedValue({
      data: [{ account_id: '42', username: 'alice' }],
      error: null,
    })

    await expect(resolvePublicProfileIdentity('Alice')).resolves.toEqual({
      accountId: '42',
      username: 'alice',
    })
    expect(rpcMock).toHaveBeenCalledWith(
      'directory_members_by_username',
      {
        p_usernames: ['alice'],
      },
      { get: true },
    )
    expect(fromMock).not.toHaveBeenCalled()
  })

  test('does not retry an ineligible handle through the slower directory view', async () => {
    rpcMock.mockResolvedValue({ data: [], error: null })

    await expect(resolvePublicProfileIdentity('Alice')).resolves.toBeNull()
    expect(rpcMock).toHaveBeenCalledTimes(1)
    expect(fromMock).not.toHaveBeenCalled()
  })

  test.each([true, false])(
    'retains the directory archive flag (%s) for the header read',
    async (hasArchive) => {
      rpcMock.mockResolvedValue({
        data: [
          { account_id: '42', username: 'alice', has_archive: hasArchive },
        ],
        error: null,
      })
      await expect(resolvePublicProfileIdentity('alice')).resolves.toEqual({
        accountId: '42',
        username: 'alice',
        hasArchive,
      })
    },
  )

  test('checks membership again on the next request and preserves literal underscores', async () => {
    rpcMock
      .mockResolvedValueOnce({
        data: [{ account_id: '42', username: 'alice_dev' }],
        error: null,
      })
      .mockResolvedValueOnce({ data: [], error: null })

    await expect(resolvePublicProfileIdentity('Alice_dev')).resolves.toEqual({
      accountId: '42',
      username: 'alice_dev',
    })
    await expect(resolvePublicProfileIdentity('Alice_dev')).resolves.toBeNull()
    expect(rpcMock).toHaveBeenCalledTimes(2)
    expect(rpcMock).toHaveBeenLastCalledWith(
      'directory_members_by_username',
      { p_usernames: ['alice_dev'] },
      { get: true },
    )
    expect(fromMock).not.toHaveBeenCalled()
  })

  test('returns null when the RPC finds no directory member', async () => {
    rpcMock.mockResolvedValue({ data: [], error: null })

    await expect(resolvePublicProfileIdentity('42')).resolves.toBeNull()
    expect(rpcMock).toHaveBeenCalledWith(
      'resolve_directory_identity',
      {
        identifier: '42',
      },
      { get: true },
    )
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
