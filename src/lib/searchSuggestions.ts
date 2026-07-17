import type { DirectoryUser } from '@/lib/types'

export interface UsernameSearchToken {
  start: number
  end: number
  fragment: string
}

export type UserSuggestion = Pick<
  DirectoryUser,
  | 'directory_id'
  | 'username'
  | 'account_display_name'
  | 'avatar_media_url'
  | 'num_followers'
>

export function getUsernameSearchToken(
  value: string,
  caretPosition: number | null,
): UsernameSearchToken | null {
  const caret = Math.max(
    0,
    Math.min(caretPosition ?? value.length, value.length),
  )
  let start = caret
  let end = caret

  while (start > 0 && !/\s/.test(value[start - 1])) start -= 1
  while (end < value.length && !/\s/.test(value[end])) end += 1

  const token = value.slice(start, end)
  const match = token.match(/^(?:from:)?@?([a-z0-9_]{2,15})$/i)

  return match ? { start, end, fragment: match[1].toLocaleLowerCase() } : null
}

export function replaceUsernameTokenWithFromFilter(
  value: string,
  token: UsernameSearchToken,
  username: string,
) {
  const filter = `from:${username}`

  return {
    value: `${value.slice(0, token.start)}${filter}${value.slice(token.end)}`,
    caretPosition: token.start + filter.length,
  }
}

export function rankUserSuggestions(
  users: UserSuggestion[],
  fragment: string,
  limit: number,
) {
  const normalizedFragment = fragment.toLocaleLowerCase()

  return [...users]
    .sort((left, right) => {
      const leftUsername = left.username.toLocaleLowerCase()
      const rightUsername = right.username.toLocaleLowerCase()
      const leftExact = leftUsername === normalizedFragment
      const rightExact = rightUsername === normalizedFragment
      if (leftExact !== rightExact) return leftExact ? -1 : 1

      const leftPrefix = leftUsername.startsWith(normalizedFragment)
      const rightPrefix = rightUsername.startsWith(normalizedFragment)
      if (leftPrefix !== rightPrefix) return leftPrefix ? -1 : 1

      const positionDifference =
        leftUsername.indexOf(normalizedFragment) -
        rightUsername.indexOf(normalizedFragment)
      if (positionDifference !== 0) return positionDifference

      const followerDifference =
        (right.num_followers ?? -1) - (left.num_followers ?? -1)
      if (followerDifference !== 0) return followerDifference

      return leftUsername.localeCompare(rightUsername)
    })
    .slice(0, limit)
}
