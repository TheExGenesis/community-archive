/** Covers for CA Library works, served from our own domain. */

/** The URL carries a hash of the source, so a changed cover is a new URL. */
export const COVER_CACHE_CONTROL =
  'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400'

/** Short stable hash (FNV-1a) of the source URL, for cache busting. */
export function coverVersion(source: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < source.length; i += 1) {
    h ^= source.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(36)
}

export function libraryCoverSrc(id: string, source: string): string {
  return `/api/library/cover/${id}?v=${coverVersion(source)}`
}

/** https on the default port, to a named host (no IP literals or localhost). */
export function coverUpstreamAllowed(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  const host = url.hostname.toLowerCase()
  return (
    url.protocol === 'https:' &&
    url.port === '' &&
    !url.username &&
    !url.password &&
    host.includes('.') &&
    !/^[\d.]+$/.test(host) &&
    !host.startsWith('[') &&
    !host.endsWith('.localhost') &&
    !host.endsWith('.internal') &&
    !host.endsWith('.local')
  )
}
