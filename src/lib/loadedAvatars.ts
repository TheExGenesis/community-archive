// Avatar URLs that already loaded on this page, keyed by account id and by
// lower-case handle, so a second picture of the same person (a hover card,
// say) shows the photo the page found instead of retrying a stale one.
const loaded = new Map<string, string>()

const keysOf = (person: {
  accountId?: string | null
  username?: string | null
}) =>
  [person.accountId, person.username?.toLowerCase()].filter(
    (key): key is string => !!key,
  )

export function rememberLoadedAvatar(
  person: { accountId?: string | null; username?: string | null },
  url: string,
) {
  for (const key of keysOf(person)) loaded.set(key, url)
}

export function loadedAvatar(person: {
  accountId?: string | null
  username?: string | null
}): string | undefined {
  for (const key of keysOf(person)) {
    const url = loaded.get(key)
    if (url) return url
  }
  return undefined
}

/** Forgets loaded avatars; for tests. */
export function clearLoadedAvatars() {
  loaded.clear()
}
