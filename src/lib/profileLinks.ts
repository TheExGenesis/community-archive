import 'server-only'

import type { ResolvedProfileLink } from '@/lib/metaTwitter/types'

const urlPattern = /https?:\/\/[^\s]+/g
const tcoPattern = /^https:\/\/t\.co\/[A-Za-z0-9]+$/

const displayUrl = (value: string) => {
  try {
    const parsed = new URL(value)
    const host = parsed.hostname.replace(/^www\./, '')
    const path =
      parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, '')
    return `${host}${path}${parsed.search}`
  } catch {
    return value.replace(/^https?:\/\//, '')
  }
}

const safeRedirect = (shortUrl: string, location: string | null) => {
  if (!location) return shortUrl
  try {
    const resolved = new URL(location, shortUrl)
    return resolved.protocol === 'http:' || resolved.protocol === 'https:'
      ? resolved.toString()
      : shortUrl
  } catch {
    return shortUrl
  }
}

async function resolveUrl(url: string): Promise<ResolvedProfileLink> {
  if (!tcoPattern.test(url)) {
    return {
      original_url: url,
      expanded_url: url,
      display_url: displayUrl(url),
    }
  }

  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'manual',
      signal: AbortSignal.timeout(2_000),
      next: { revalidate: 604_800 },
    })
    const expandedUrl = safeRedirect(url, response.headers.get('location'))
    return {
      original_url: url,
      expanded_url: expandedUrl,
      display_url: displayUrl(expandedUrl),
    }
  } catch {
    return {
      original_url: url,
      expanded_url: url,
      display_url: displayUrl(url),
    }
  }
}

export async function resolveProfileLinks(
  values: Array<string | null | undefined>,
): Promise<ResolvedProfileLink[]> {
  const urls = new Set(
    values.flatMap((value) => value?.match(urlPattern) ?? []),
  )
  return Promise.all(Array.from(urls, resolveUrl))
}
