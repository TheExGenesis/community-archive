const fromMock = jest.fn()

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: fromMock }),
}))

jest.mock('next/cache', () => ({
  unstable_cache: (callback: unknown) => callback,
}))

import { getCachedProfileHeader } from './data'

type QueryResult = { data: unknown; error: unknown }

const queryFor = (result: QueryResult) => {
  const query = {
    select: jest.fn(),
    eq: jest.fn(),
    order: jest.fn(),
    limit: jest.fn(),
    maybeSingle: jest.fn(async () => result),
  }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
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
