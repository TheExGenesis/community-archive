import { DirectoryUser } from '@/lib/types'
import {
  buildDirectorySearchFilter,
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

describe('getDirectoryProfileHref', () => {
  it('links account-backed members by account ID', () => {
    expect(
      getDirectoryProfileHref(
        directoryUser({
          directory_id: 'archive:123456789',
          account_id: '123456789',
        }),
      ),
    ).toBe('/user/archive%3A123456789')
  })

  it('links opt-in-only members by their stable directory ID', () => {
    expect(
      getDirectoryProfileHref(
        directoryUser({ directory_id: 'optin:42', account_id: null }),
      ),
    ).toBe('/user/optin%3A42')
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
      mockSupabase([row], [
        { account_id: '123', header_media_url: 'https://example.com/header' },
      ]) as any,
      '123',
    )

    expect(result).toMatchObject({
      account_id: '123',
      has_archive: true,
      header_media_url: 'https://example.com/header',
    })
  })
})
