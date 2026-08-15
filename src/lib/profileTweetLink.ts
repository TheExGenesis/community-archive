const tweetIdPattern = /^\d{1,20}$/

/** Extract an archived tweet ID from an X, Twitter, or Community Archive URL. */
export function parseProfileTweetId(value: string): string | null {
  const input = value.trim()
  if (tweetIdPattern.test(input)) return input

  let url: URL
  try {
    url = new URL(input, 'https://community-archive.org')
  } catch {
    return null
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, '')
  const segments = url.pathname.split('/').filter(Boolean)
  let candidate: string | undefined

  if (hostname === 'x.com' || hostname === 'twitter.com') {
    const statusIndex = segments.indexOf('status')
    candidate = statusIndex > 0 ? segments[statusIndex + 1] : undefined
  } else if (hostname === 'community-archive.org' || hostname === 'localhost') {
    candidate = segments[0] === 'tweets' ? segments[1] : undefined
  }

  return candidate && tweetIdPattern.test(candidate) ? candidate : null
}
