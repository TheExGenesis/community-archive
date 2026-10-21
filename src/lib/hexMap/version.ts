export const MAP_VERSION = 'spread-2026-07-hero-v2'
// Region labels/boundaries can change without moving any account between cells.
export const MAP_REVISION = 'tpot-regions-38-colors-v2'
export function mapUrl(path: string) {
  return `/api/hex-map/${path}${path.includes('?') ? '&' : '?'}version=${MAP_VERSION}&revision=${MAP_REVISION}`
}
