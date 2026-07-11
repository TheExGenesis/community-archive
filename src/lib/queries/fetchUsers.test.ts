import { buildDirectorySearchFilter } from './fetchUsers'

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
