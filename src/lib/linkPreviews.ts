import 'server-only'

import { createHash } from 'crypto'
import { lookup } from 'dns/promises'
import { BlockList, isIP, type LookupFunction } from 'net'
import { Agent, fetch as undiciFetch } from 'undici'
import { createServerServiceRoleClient } from '@/utils/supabase'
import type { TweetLinkPreview } from './linkPreviewTypes'

const MAX_URL_LENGTH = 2048
const MAX_HTML_BYTES = 512 * 1024
const MAX_REDIRECTS = 3
const FETCH_TIMEOUT_MS = 4_000
const READY_TTL_MS = 30 * 24 * 60 * 60 * 1000
const FAILED_TTL_MS = 6 * 60 * 60 * 1000
const UNSAFE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const MAX_PREVIEWS_PER_TWEET = 2
const MAX_ENRICHMENTS_PER_REQUEST = 3

const blockedAddresses = new BlockList()
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blockedAddresses.addSubnet(network, prefix, 'ipv4')
}
for (const [network, prefix] of [
  ['::', 96],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 23],
  ['2002::', 16],
  ['fc00::', 7],
  ['fec0::', 10],
  ['fe80::', 10],
  ['2001:db8::', 32],
  ['ff00::', 8],
] as const) {
  blockedAddresses.addSubnet(network, prefix, 'ipv6')
}

type PreviewStatus = 'ready' | 'unsafe' | 'failed'

interface CachedPreviewRow {
  url_hash: string
  normalized_url: string
  canonical_url: string | null
  title: string | null
  description: string | null
  image_url: string | null
  site_name: string | null
  content_type: string | null
  status: string
  expires_at: string
}

interface PreviewMetadata {
  canonicalUrl: string
  title: string
  description: string | null
  imageUrl: string | null
  siteName: string
  contentType: string
  isXArticle: boolean
}

export class UnsafePreviewUrlError extends Error {}

const decodeHtml = (value: string) =>
  value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d{1,7});/g, (_, digits: string) =>
      String.fromCodePoint(Number(digits)),
    )
    .replace(/&#x([\da-f]{1,6});/gi, (_, digits: string) =>
      String.fromCodePoint(Number.parseInt(digits, 16)),
    )

const cleanText = (value: string | undefined, limit: number) => {
  if (!value) return null
  const cleaned = decodeHtml(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned ? cleaned.slice(0, limit) : null
}

export function normalizePreviewUrl(rawUrl: string): string {
  if (!rawUrl || rawUrl.length > MAX_URL_LENGTH) {
    throw new UnsafePreviewUrlError('Preview URL is invalid')
  }
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new UnsafePreviewUrlError('Preview URL is invalid')
  }
  if (
    (url.protocol !== 'https:' && url.protocol !== 'http:') ||
    url.username ||
    url.password
  ) {
    throw new UnsafePreviewUrlError('Preview URL is not allowed')
  }
  url.hash = ''
  url.hostname = url.hostname.toLowerCase()
  if (
    (url.protocol === 'https:' && url.port === '443') ||
    (url.protocol === 'http:' && url.port === '80')
  ) {
    url.port = ''
  }
  return url.toString()
}

export const previewUrlHash = (url: string) =>
  createHash('sha256').update(normalizePreviewUrl(url)).digest('hex')

export function isXArticleUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    const host = url.hostname.toLowerCase().replace(/^www\./, '')
    return (
      (host === 'x.com' || host === 'twitter.com') &&
      (/^\/i\/article(?:\/|$)/.test(url.pathname) ||
        /^\/[^/]+\/article\//.test(url.pathname))
    )
  } catch {
    return false
  }
}

export function isPublicIpAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) {
    return !blockedAddresses.check(address, 'ipv4')
  }
  if (family === 6) {
    const normalized = address.toLowerCase()
    if (normalized.startsWith('::ffff:')) {
      const mapped = normalized.slice('::ffff:'.length)
      if (isIP(mapped) === 4) return isPublicIpAddress(mapped)
      const words = mapped.split(':')
      if (words.length === 2) {
        const high = Number.parseInt(words[0], 16)
        const low = Number.parseInt(words[1], 16)
        if (
          Number.isInteger(high) &&
          Number.isInteger(low) &&
          high >= 0 &&
          high <= 0xffff &&
          low >= 0 &&
          low <= 0xffff
        ) {
          return isPublicIpAddress(
            `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`,
          )
        }
      }
      return false
    }
    return !blockedAddresses.check(address, 'ipv6')
  }
  return false
}

type HostResolver = (
  hostname: string,
) => Promise<Array<{ address: string; family: number }>>

const defaultResolver: HostResolver = (hostname) =>
  lookup(hostname, { all: true, verbatim: true })

export async function assertSafeRemoteUrl(
  rawUrl: string,
  resolver: HostResolver = defaultResolver,
): Promise<string> {
  return (await resolveSafeRemoteUrl(rawUrl, resolver)).normalized
}

async function resolveSafeRemoteUrl(rawUrl: string, resolver: HostResolver) {
  const normalized = normalizePreviewUrl(rawUrl)
  const url = new URL(normalized)
  const hostname = url.hostname.toLowerCase()
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new UnsafePreviewUrlError('Preview host is not allowed')
  }
  const literalFamily = isIP(hostname)
  const addresses = literalFamily
    ? [{ address: hostname, family: literalFamily }]
    : await resolver(hostname)
  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => !isPublicIpAddress(address))
  ) {
    throw new UnsafePreviewUrlError('Preview host is not public')
  }
  return { normalized, addresses }
}

async function readResponseBytes(response: Response, maximum: number) {
  const declared = Number(response.headers.get('content-length') ?? 0)
  if (Number.isFinite(declared) && declared > maximum) {
    throw new Error('Preview response is too large')
  }
  if (!response.body) return new Uint8Array()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maximum) {
      await reader.cancel()
      throw new Error('Preview response is too large')
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

type SafeFetchOptions = {
  accept: string
  maximumBytes: number
  allowedContentTypes: (contentType: string) => boolean
}

export async function fetchSafeRemoteResource(
  rawUrl: string,
  options: SafeFetchOptions,
  fetcher?: typeof fetch,
  resolver: HostResolver = defaultResolver,
) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  let currentUrl = rawUrl
  try {
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      const safeTarget = await resolveSafeRemoteUrl(currentUrl, resolver)
      currentUrl = safeTarget.normalized
      const pinnedAddress = safeTarget.addresses[0]
      const dispatcher = fetcher
        ? null
        : new Agent({
            connect: {
              lookup: ((_, __, callback) =>
                callback(
                  null,
                  pinnedAddress.address,
                  pinnedAddress.family as 4 | 6,
                )) as LookupFunction,
            },
          })
      try {
        const request = {
          redirect: 'manual' as const,
          signal: controller.signal,
          headers: {
            Accept: options.accept,
            'User-Agent':
              'CommunityArchiveLinkPreview/1.0 (+https://www.community-archive.org)',
          },
        }
        const response = fetcher
          ? await fetcher(currentUrl, request)
          : ((await undiciFetch(currentUrl, {
              ...request,
              dispatcher: dispatcher!,
            })) as unknown as Response)
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location')
          await response.body?.cancel()
          if (!location || redirects === MAX_REDIRECTS) {
            throw new Error('Preview redirect limit exceeded')
          }
          currentUrl = new URL(location, currentUrl).toString()
          continue
        }
        if (!response.ok) throw new Error(`Preview returned ${response.status}`)
        const contentType = (response.headers.get('content-type') ?? '')
          .split(';')[0]
          .trim()
          .toLowerCase()
        if (!options.allowedContentTypes(contentType)) {
          await response.body?.cancel()
          throw new Error('Preview content type is not allowed')
        }
        return {
          bytes: await readResponseBytes(response, options.maximumBytes),
          contentType,
          finalUrl: currentUrl,
        }
      } finally {
        await dispatcher?.close()
      }
    }
    throw new Error('Preview redirect limit exceeded')
  } finally {
    clearTimeout(timeout)
  }
}

const attributes = (tag: string) => {
  const result: Record<string, string> = {}
  const pattern = /([^\s=/>]+)\s*=\s*(["'])(.*?)\2/gis
  let match: RegExpExecArray | null
  while ((match = pattern.exec(tag))) {
    result[match[1].toLowerCase()] = match[3]
  }
  return result
}

const metadataFromHtml = (html: string) => {
  const metadata = new Map<string, string>()
  for (const tag of html.match(/<meta\s+[^>]*>/gi) ?? []) {
    const attrs = attributes(tag)
    const key = (attrs.property || attrs.name || '').toLowerCase()
    if (key && attrs.content && !metadata.has(key)) {
      metadata.set(key, attrs.content)
    }
  }
  let canonical: string | null = null
  for (const tag of html.match(/<link\s+[^>]*>/gi) ?? []) {
    const attrs = attributes(tag)
    if ((attrs.rel || '').toLowerCase().split(/\s+/).includes('canonical')) {
      canonical = attrs.href || null
      break
    }
  }
  return { metadata, canonical }
}

export async function fetchLinkPreviewMetadata(
  rawUrl: string,
  fetcher?: typeof fetch,
  resolver: HostResolver = defaultResolver,
): Promise<PreviewMetadata> {
  const result = await fetchSafeRemoteResource(
    rawUrl,
    {
      accept: 'text/html,application/xhtml+xml;q=0.9',
      maximumBytes: MAX_HTML_BYTES,
      allowedContentTypes: (contentType) =>
        contentType === 'text/html' || contentType === 'application/xhtml+xml',
    },
    fetcher,
    resolver,
  )
  const html = new TextDecoder().decode(result.bytes)
  const { metadata, canonical } = metadataFromHtml(html)
  const article = isXArticleUrl(rawUrl) || isXArticleUrl(result.finalUrl)
  const rawTitle =
    metadata.get('og:title') ||
    metadata.get('twitter:title') ||
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  const title = cleanText(rawTitle, 240) ?? (article ? 'X Article' : null)
  if (!title) throw new Error('Preview has no title')

  const canonicalUrl = normalizePreviewUrl(
    canonical
      ? new URL(canonical, result.finalUrl).toString()
      : result.finalUrl,
  )
  const rawImage =
    metadata.get('og:image:secure_url') ||
    metadata.get('og:image') ||
    metadata.get('twitter:image')
  let imageUrl: string | null = null
  if (rawImage) {
    try {
      imageUrl = normalizePreviewUrl(
        new URL(rawImage, result.finalUrl).toString(),
      )
    } catch {
      imageUrl = null
    }
  }

  return {
    canonicalUrl,
    title,
    description:
      cleanText(
        metadata.get('og:description') ||
          metadata.get('twitter:description') ||
          metadata.get('description'),
        500,
      ) ?? (article ? 'Read the full article on X.' : null),
    imageUrl,
    siteName:
      cleanText(metadata.get('og:site_name'), 120) ??
      (article ? 'X' : new URL(canonicalUrl).hostname.replace(/^www\./, '')),
    contentType: result.contentType,
    isXArticle: article,
  }
}

const fallbackXArticle = (url: string): PreviewMetadata => ({
  canonicalUrl: normalizePreviewUrl(url),
  title: 'X Article',
  description: 'Read the full article on X.',
  imageUrl: null,
  siteName: 'X',
  contentType: 'text/html',
  isXArticle: true,
})

function rowToPreview(row: CachedPreviewRow): TweetLinkPreview | null {
  if (row.status !== 'ready' || !row.title) return null
  return {
    urlHash: row.url_hash,
    url: row.normalized_url,
    canonicalUrl: row.canonical_url ?? row.normalized_url,
    title: row.title,
    description: row.description,
    imageUrl: row.image_url,
    siteName:
      row.site_name ??
      new URL(row.normalized_url).hostname.replace(/^www\./, ''),
    isXArticle: isXArticleUrl(row.canonical_url ?? row.normalized_url),
  }
}

const previewCandidate = (rawUrl: string) => {
  const normalized = normalizePreviewUrl(rawUrl)
  const url = new URL(normalized)
  const host = url.hostname.replace(/^www\./, '')
  if (host === 'pic.twitter.com' || host === 'pbs.twimg.com') return null
  if (
    (host === 'x.com' || host === 'twitter.com') &&
    (/^\/[^/]+\/status\/\d+/.test(url.pathname) ||
      /^\/i\/web\/status\/\d+/.test(url.pathname)) &&
    !isXArticleUrl(normalized)
  ) {
    return null
  }
  return normalized
}

async function refreshPreview(url: string): Promise<CachedPreviewRow | null> {
  const supabase = createServerServiceRoleClient()
  const urlHash = previewUrlHash(url)
  const fetchedAt = new Date()
  let status: PreviewStatus = 'ready'
  let metadata: PreviewMetadata | null = null
  let expiresAt = new Date(fetchedAt.getTime() + READY_TTL_MS)
  try {
    metadata = await fetchLinkPreviewMetadata(url)
  } catch (error) {
    if (isXArticleUrl(url)) {
      metadata = fallbackXArticle(url)
    } else if (error instanceof UnsafePreviewUrlError) {
      status = 'unsafe'
      expiresAt = new Date(fetchedAt.getTime() + UNSAFE_TTL_MS)
    } else {
      status = 'failed'
      expiresAt = new Date(fetchedAt.getTime() + FAILED_TTL_MS)
    }
  }

  const { data, error } = await supabase
    .from('tweet_link_previews')
    .upsert(
      {
        url_hash: urlHash,
        normalized_url: url,
        canonical_url: metadata?.canonicalUrl ?? null,
        title: metadata?.title ?? null,
        description: metadata?.description ?? null,
        image_url: metadata?.imageUrl ?? null,
        site_name: metadata?.siteName ?? null,
        content_type: metadata?.contentType ?? null,
        status,
        fetched_at: fetchedAt.toISOString(),
        expires_at: expiresAt.toISOString(),
      },
      { onConflict: 'url_hash' },
    )
    .select(
      'url_hash, normalized_url, canonical_url, title, description, image_url, site_name, content_type, status, expires_at',
    )
    .single()
  if (error) {
    console.error('Failed to cache tweet link preview:', error)
    return null
  }
  return data
}

export async function getTweetLinkPreviews(tweetIds: string[]) {
  const safeTweetIds = Array.from(
    new Set(tweetIds.filter((tweetId) => /^\d{1,20}$/.test(tweetId))),
  ).slice(0, 100)
  const result = new Map<string, TweetLinkPreview[]>()
  if (safeTweetIds.length === 0) return result

  const supabase = createServerServiceRoleClient()
  const { data: urlRows, error: urlError } = await supabase
    .from('tweet_urls')
    .select('tweet_id, url, expanded_url')
    .in('tweet_id', safeTweetIds)
  if (urlError) {
    console.error('Failed to load tweet URLs for previews:', urlError)
    return result
  }

  const candidatesByTweet = new Map<string, string[]>()
  const allCandidates = new Set<string>()
  for (const row of urlRows ?? []) {
    try {
      const candidate = previewCandidate(row.expanded_url || row.url)
      if (!candidate) continue
      const current = candidatesByTweet.get(row.tweet_id) ?? []
      if (
        !current.includes(candidate) &&
        current.length < MAX_PREVIEWS_PER_TWEET
      ) {
        current.push(candidate)
        candidatesByTweet.set(row.tweet_id, current)
        allCandidates.add(candidate)
      }
    } catch {
      // Invalid archive URL: retain the ordinary tweet text and omit the card.
    }
  }
  if (allCandidates.size === 0) return result

  const hashes = Array.from(allCandidates, previewUrlHash)
  const { data: cachedRows, error: cacheError } = await supabase
    .from('tweet_link_previews')
    .select(
      'url_hash, normalized_url, canonical_url, title, description, image_url, site_name, content_type, status, expires_at',
    )
    .in('url_hash', hashes)
  if (cacheError) {
    console.error('Failed to read tweet link preview cache:', cacheError)
    return result
  }

  const rowsByUrl = new Map(
    (cachedRows ?? []).map((row) => [row.normalized_url, row]),
  )
  const now = Date.now()
  const refreshCandidates = Array.from(allCandidates)
    .filter((url) => {
      const cached = rowsByUrl.get(url)
      return !cached || new Date(cached.expires_at).getTime() <= now
    })
    .slice(0, MAX_ENRICHMENTS_PER_REQUEST)
  const refreshed = await Promise.allSettled(
    refreshCandidates.map(refreshPreview),
  )
  refreshed.forEach((entry, index) => {
    if (entry.status === 'fulfilled' && entry.value) {
      rowsByUrl.set(refreshCandidates[index], entry.value)
    }
  })

  for (const [tweetId, urls] of Array.from(candidatesByTweet.entries())) {
    const previews = urls.flatMap((url) => {
      const row = rowsByUrl.get(url)
      const preview = row ? rowToPreview(row) : null
      return preview ? [preview] : []
    })
    if (previews.length > 0) result.set(tweetId, previews)
  }
  return result
}
