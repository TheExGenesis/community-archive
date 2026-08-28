import { DirectoryUser } from '@/lib/types'
import {
  buildDirectorySearchFilter,
  fetchAccountSuggestions,
  fetchMemberSuggestions,
  fetchUsers,
  getDirectoryProfileHref,
  getUserData,
} from './fetchUsers'

const directoryUser = (overrides: Partial<DirectoryUser>): DirectoryUser => ({
  directory_id: 'optin:1',
  account_id: null,
  username: 'archive_member',
  account_display_name: 'Archive Member',
  avatar_media_url: null,
  num_followers: null,
  has_archive: false,
  is_opted_in: true,
  opted_in_at: '2026-07-11T00:00:00Z',
  archive_uploaded_at: null,
  joined_at: '2026-07-11T00:00:00Z',
  ...overrides,
})

describe('buildDirectorySearchFilter', () => {
  it('quotes commas and other PostgREST logic characters', () => {
    expect(buildDirectorySearchFilter('archive, team')).toBe(
      'username.ilike."%archive, team%",account_display_name.ilike."%archive, team%"',
    )
  })

  it('escapes quotes and backslashes inside quoted filter values', () => {
    expect(buildDirectorySearchFilter('a"b\\c')).toBe(
      'username.ilike."%a\\"b\\\\c%",account_display_name.ilike."%a\\"b\\\\c%"',
    )
  })
})

describe('fetchUsers', () => {
  it('requests a bounded ClickHouse-backed website page', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ users: [directoryUser({})], hasMore: true }),
    })

    await expect(
      fetchUsers(
        {
          limit: 15,
          offset: 30,
          sortBy: 'joined_at',
          sortOrder: 'asc',
          search: 'alice',
        },
        fetchImpl as unknown as typeof fetch,
      ),
    ).resolves.toMatchObject({ hasMore: true })
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/user-directory?limit=15&offset=30&sort_by=joined_at&sort_order=asc&search=alice',
      { cache: 'no-store' },
    )
  })
})

describe('user suggestions', () => {
  it('searches the bounded member-directory endpoint first', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        users: [
          directoryUser({
            account_id: '2',
            directory_id: 'archive:2',
            username: 'alexgenesis',
            num_followers: 10_000,
          }),
          directoryUser({
            account_id: '1',
            directory_id: 'archive:1',
            username: 'exgenesis',
            num_followers: 10,
          }),
          directoryUser({ username: 'unrelated' }),
        ],
        hasMore: false,
      }),
    })

    await expect(
      fetchMemberSuggestions('ExGenesis', 6, fetchImpl as any),
    ).resolves.toMatchObject([
      { username: 'exgenesis' },
      { username: 'alexgenesis' },
    ])
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/user-directory?limit=30&offset=0&sort_by=username&sort_order=asc&search=exgenesis',
      { cache: 'no-store' },
    )
  })

  it('uses the ranked account RPC for handle, display-name, and fuzzy matches', async () => {
    const result = {
      data: [
        {
          account_id: '456',
          username: 'other_user',
          account_display_name: 'Other User',
          num_followers: 50,
        },
      ],
      error: null,
    }
    const rpc = jest.fn().mockResolvedValue(result)
    const supabase = { schema: jest.fn(() => ({ rpc })) }

    await expect(
      fetchAccountSuggestions(supabase as any, 'other', 6),
    ).resolves.toEqual([
      {
        account_id: '456',
        directory_id: 'account:456',
        username: 'other_user',
        account_display_name: 'Other User',
        avatar_media_url: null,
        num_followers: 50,
      },
    ])
    expect(rpc).toHaveBeenCalledWith('search_user_suggestions', {
      search_text: 'other',
      result_limit: 30,
    })
  })

  it('falls back to a prefix query while the ranked RPC is being deployed', async () => {
    const result = {
      data: [
        {
          account_id: '456',
          username: 'ChristineNiles1',
          account_display_name: 'Christine Niles',
          num_followers: 10_000,
        },
        {
          account_id: '123',
          username: 'christineist',
          account_display_name: 'Christine Shiba',
          num_followers: 10,
        },
      ],
      error: null,
    }
    const query: Record<string, jest.Mock> = {}
    query.select = jest.fn(() => query)
    query.ilike = jest.fn(() => query)
    query.order = jest.fn(() => query)
    query.limit = jest.fn().mockResolvedValue(result)
    const from = jest.fn(() => query)
    const rpc = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'function not found' },
    })
    const supabase = { schema: jest.fn(() => ({ from, rpc })) }

    const suggestions = await fetchAccountSuggestions(
      supabase as any,
      'christine',
      6,
    )

    expect(suggestions[0]).toMatchObject({ username: 'christineist' })
    expect(query.ilike).toHaveBeenCalledWith('username', 'christine%')
  })
})

describe('getDirectoryProfileHref', () => {
  it('uses a readable username for account-backed members', () => {
    expect(
      getDirectoryProfileHref(
        directoryUser({
          directory_id: 'archive:123456789',
          account_id: '123456789',
        }),
      ),
    ).toBe('/user/archive_member')
  })

  it('uses the username for opt-in-only members too', () => {
    expect(
      getDirectoryProfileHref(
        directoryUser({ directory_id: 'optin:42', account_id: null }),
      ),
    ).toBe('/user/archive_member')
  })
})

const mockSupabase = (
  directoryRows: Array<Record<string, unknown>>,
  profileRows: Array<Record<string, unknown>> = [],
) => ({
  schema: () => ({
    from: (table: string) => {
      const filters: Array<[string, string]> = []
      const query = {
        select: () => query,
        eq: (column: string, value: string) => {
          filters.push([column, value])
          return query
        },
        ilike: (column: string, value: string) => {
          filters.push([column, value.toLowerCase()])
          return query
        },
        order: () => query,
        limit: () => query,
        maybeSingle: async () => {
          const rows = table === 'user_directory' ? directoryRows : profileRows
          const data = rows.find((row) =>
            filters.every(([column, value]) => {
              const candidate = String(row[column] ?? '')
              return column === 'username'
                ? candidate.toLowerCase() === value
                : candidate === value
            }),
          )

          return { data: data ?? null, error: null }
        },
      }

      return query
    },
  }),
})

describe('getUserData', () => {
  it('loads an opt-in-only profile by directory ID', async () => {
    const row = {
      directory_id: 'optin:42',
      account_id: null,
      username: 'opted_in_member',
      account_display_name: 'Opted In Member',
      created_at: null,
      bio: null,
      website: null,
      location: null,
      avatar_media_url: null,
      archive_at: null,
      archive_uploaded_at: null,
      num_tweets: null,
      num_followers: null,
      num_following: null,
      num_likes: null,
      joined_at: '2026-07-11T00:00:00Z',
      has_archive: false,
      is_opted_in: true,
    }

    const result = await getUserData(mockSupabase([row]) as any, 'optin%3A42')

    expect(result).toMatchObject({
      username: 'opted_in_member',
      account_id: null,
      has_archive: false,
      is_opted_in: true,
      header_media_url: null,
    })
  })

  it('keeps old account-ID URLs working and loads the profile header', async () => {
    const row = {
      directory_id: 'archive:123',
      account_id: '123',
      username: 'archive_member',
      account_display_name: 'Archive Member',
      created_at: '2009-01-01T00:00:00Z',
      bio: 'Preserving the web',
      website: null,
      location: null,
      avatar_media_url: null,
      archive_at: '2026-01-01T00:00:00Z',
      archive_uploaded_at: '2026-01-02T00:00:00Z',
      num_tweets: 10,
      num_followers: 20,
      num_following: 30,
      num_likes: 40,
      joined_at: '2026-01-02T00:00:00Z',
      has_archive: true,
      is_opted_in: false,
    }

    const result = await getUserData(
      mockSupabase(
        [row],
        [{ account_id: '123', header_media_url: 'https://example.com/header' }],
      ) as any,
      '123',
    )

    expect(result).toMatchObject({
      account_id: '123',
      has_archive: true,
      header_media_url: 'https://example.com/header',
    })
  })

  it('uses the explicit username namespace even for numeric usernames', async () => {
    const row = {
      directory_id: 'archive:456',
      account_id: '456',
      username: '123',
      account_display_name: 'Numeric Username',
      created_at: null,
      bio: null,
      website: null,
      location: null,
      avatar_media_url: null,
      archive_at: null,
      archive_uploaded_at: null,
      num_tweets: null,
      num_followers: null,
      num_following: null,
      num_likes: null,
      joined_at: null,
      has_archive: true,
      is_opted_in: false,
    }

    const result = await getUserData(mockSupabase([row]) as any, '%40123')

    expect(result?.account_id).toBe('456')
  })
})
