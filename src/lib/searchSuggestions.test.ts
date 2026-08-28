import {
  getUsernameSearchToken,
  getStandaloneUserSearchTerm,
  mergeUserSuggestions,
  rankUserSuggestions,
  replaceUsernameTokenWithFromFilter,
  UserSuggestion,
} from './searchSuggestions'

const suggestion = (
  username: string,
  numFollowers: number | null = null,
): UserSuggestion => ({
  account_id: username,
  directory_id: `archive:${username}`,
  username,
  account_display_name: username,
  avatar_media_url: null,
  num_followers: numFollowers,
})

describe('username search suggestions', () => {
  it('finds plain, @-prefixed, and partial from: username tokens', () => {
    expect(getUsernameSearchToken('archive exg', 11)).toEqual({
      start: 8,
      end: 11,
      fragment: 'exg',
    })
    expect(getUsernameSearchToken('@ExGenesis', 11)?.fragment).toBe('exgenesis')
    expect(getUsernameSearchToken('future from:ExG', 15)).toEqual({
      start: 7,
      end: 15,
      fragment: 'exg',
    })
  })

  it('ignores punctuation, one-character words, and other operators', () => {
    expect(getUsernameSearchToken('a', 1)).toBeNull()
    expect(getUsernameSearchToken('local-first', 11)).toBeNull()
    expect(getUsernameSearchToken('since:2024', 10)).toBeNull()
  })

  it('replaces only the active token with a from: filter', () => {
    const value = 'archive exg research'
    const token = getUsernameSearchToken(value, 10)

    expect(
      replaceUsernameTokenWithFromFilter(value, token!, 'exgenesis'),
    ).toEqual({
      value: 'archive from:exgenesis research',
      caretPosition: 22,
    })
  })

  it('ranks exact and prefix username matches before popular infix matches', () => {
    expect(
      rankUserSuggestions(
        [
          suggestion('alexgenesis', 10_000),
          suggestion('exgenesis_notes', 50),
          suggestion('exgenesis', 10),
        ],
        'exgenesis',
        3,
      ).map((user) => user.username),
    ).toEqual(['exgenesis', 'exgenesis_notes', 'alexgenesis'])
  })

  it('ranks the closest prefix completion before a more popular long prefix', () => {
    expect(
      rankUserSuggestions(
        [
          suggestion('ChristineNiles1', 10_000),
          suggestion('christineist', 10),
        ],
        'christine',
        2,
      ).map((user) => user.username),
    ).toEqual(['christineist', 'ChristineNiles1'])
  })

  it('matches display names and keeps close typo matches behind direct matches', () => {
    expect(
      rankUserSuggestions(
        [
          {
            ...suggestion('random_handle', 10_000),
            account_display_name: 'Christine Shiba',
          },
          suggestion('christineist', 10),
          suggestion('christneist', 100),
        ],
        'christine',
        3,
      ).map((user) => user.username),
    ).toEqual(['christineist', 'random_handle', 'christneist'])
  })

  it('recognizes only standalone username-shaped submitted searches', () => {
    expect(getStandaloneUserSearchTerm('@ChristineIst')).toBe('christineist')
    expect(getStandaloneUserSearchTerm('christine ist')).toBeNull()
    expect(getStandaloneUserSearchTerm('from:christineist')).toBeNull()
  })

  it('keeps members first while deduplicating broader account matches', () => {
    const member = suggestion('archive_member', 10)

    expect(
      mergeUserSuggestions(
        [member],
        [
          { ...member, directory_id: 'account:archive_member' },
          suggestion('other_account', 10_000),
        ],
        6,
      ).map((user) => user.username),
    ).toEqual(['archive_member', 'other_account'])
  })
})
