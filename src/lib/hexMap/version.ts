export const MAP_VERSION = 'spread-2026-07-hero-v2'
export function mapUrl(path: string) {
  return `/api/hex-map/${path}${path.includes('?') ? '&' : '?'}version=${MAP_VERSION}`
}
