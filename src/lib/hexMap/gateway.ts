import 'server-only'
import { clickHouseAnalyticsGatewayBaseUrl } from '@/lib/clickhouseGateway'
import snapshot from './snapshot.json'
import type { PortalTweet } from '@/lib/portal/types'
export const mapVersion = snapshot.version
export type MapPerson = {
  account_id: string
  username: string
  cell: number
  avatar?: string | null
}
export type MapLookup = {
  version: string
  counts: Record<number, number>
  people: MapPerson[]
}
export type MapHeat = {
  version: string
  term: string
  months: string[]
  values: [number, number, number, number][]
  from: string
  to: string
}
// These routes deliberately bypass the public generic analytics proxy: all
// identity-bearing responses must pass the website's current app policy first.
export async function mapGateway<T>(
  endpoint: 'hex-lookup' | 'hex-posts' | 'hex-word-heat',
  params: Record<string, string> = {},
): Promise<T> {
  const base = clickHouseAnalyticsGatewayBaseUrl(),
    token = process.env.CLICKHOUSE_ANALYTICS_API_TOKEN
  if (!base || !token) throw new Error('Map backend unavailable')
  const url = new URL(`${base.replace(/\/$/, '')}/${endpoint}`)
  url.search = new URLSearchParams({
    ...params,
    version: mapVersion,
  }).toString()
  const result = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(endpoint === 'hex-lookup' ? 3000 : 20_000),
  })
  if (!result.ok) throw new Error('Map backend unavailable')
  return result.json()
}
export async function locate(names: string[]): Promise<MapLookup> {
  return mapGateway('hex-lookup', {
    names: Array.from(new Set(names.map((n) => n.toLowerCase())))
      .slice(0, 300)
      .join(','),
  })
}
export interface MapPost {
  tweetId: string
  accountId: string
  username: string | null
  accountDisplayName: string | null
  avatarMediaUrl: string | null
  fullText: string
  createdAt: string
  favoriteCount: number | string
  retweetCount: number | string | null
  media: {
    mediaUrl: string
    mediaType: string
    width: number | null
    height: number | null
  }[]
  quotedTweet?: MapPost | null
  cell: number
  memberQuotes: number
}
export function portalPost(row: MapPost): PortalTweet {
  const timestamp = /[zZ]$|[+-]\d\d:\d\d$/.test(row.createdAt)
    ? row.createdAt
    : `${row.createdAt.replace(' ', 'T')}Z`
  const media = (row.media ?? []).map((m) => ({
    url: m.mediaUrl,
    type: m.mediaType,
    width: m.width ?? undefined,
    height: m.height ?? undefined,
  }))
  const quoted = row.quotedTweet
    ? portalPost({ ...row.quotedTweet, quotedTweet: null })
    : undefined
  return {
    id: row.tweetId,
    accountId: row.accountId,
    username: row.username ?? '',
    name: row.accountDisplayName ?? row.username ?? '',
    avatar: row.avatarMediaUrl,
    text: row.fullText,
    createdAt: timestamp,
    observedAt: timestamp,
    likes: Number(row.favoriteCount),
    rts: Number(row.retweetCount ?? 0),
    retweetCountAvailable: row.retweetCount !== null,
    media,
    quotedTweet: quoted ? { ...quoted, media: quoted.media ?? [] } : undefined,
  }
}
