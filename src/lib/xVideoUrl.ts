/** X's video permalinks identify both the source tweet and its media slot. */
export function xVideoFromUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl)
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.port ||
      !['x.com', 'twitter.com'].includes(url.hostname.replace(/^www\./, ''))
    )
      return null
    const match = url.pathname.match(
      /^\/(?:[^/]+|i\/web)\/status\/(\d{5,20})\/video\/([1-4])\/?$/,
    )
    return match
      ? { tweetId: match[1], mediaIndex: Number(match[2]) - 1 }
      : null
  } catch {
    return null
  }
}
