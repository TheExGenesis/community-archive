import {
  getUsernameSearchToken,
  rankUserSuggestions,
  replaceUsernameTokenWithFromFilter,
  UserSuggestion,
} from './searchSuggestions'

const suggestion = (
  username: string,
  numFollowers: number | null = null,
): UserSuggestion => ({
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
})
