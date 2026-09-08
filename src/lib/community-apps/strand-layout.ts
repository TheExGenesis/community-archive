export interface StrandPosition {
  id: string
  x: number
  y: number
}
const distance = (a: StrandPosition, b: StrandPosition) =>
  (a.x - b.x) ** 2 + (a.y - b.y) ** 2

/** Stable farthest-first k-means on the original 2D semantic projection.
 * Cluster hues use their centroid angle about the whole collection's centroid.
 * Run before search/pagination so filtering never changes a strand's color.
 */
export function clusterPositions(input: StrandPosition[], count = 10) {
  const points = input
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    .sort((a, b) => a.id.localeCompare(b.id))
  if (!points.length) return []
  const center = {
    x: points.reduce((s, p) => s + p.x, 0) / points.length,
    y: points.reduce((s, p) => s + p.y, 0) / points.length,
  }
  let centers = [{ ...points[0] }]
  while (centers.length < Math.min(count, points.length)) {
    const farthest = points.reduce((best, p) =>
      Math.min(...centers.map((c) => distance(p, c))) >
      Math.min(...centers.map((c) => distance(best, c)))
        ? p
        : best,
    )
    if (centers.some((c) => distance(c, farthest) === 0)) break
    centers.push({ ...farthest })
  }
  const nearest = (p: StrandPosition) =>
    centers.reduce(
      (best, c, i) => (distance(p, c) < distance(p, centers[best]) ? i : best),
      0,
    )
  for (let iteration = 0; iteration < 30; iteration++) {
    const groups = centers.map(() => [] as StrandPosition[])
    points.forEach((p) => groups[nearest(p)].push(p))
    const next = groups.map((group, i) =>
      group.length
        ? {
            ...centers[i],
            x: group.reduce((s, p) => s + p.x, 0) / group.length,
            y: group.reduce((s, p) => s + p.y, 0) / group.length,
          }
        : centers[i],
    )
    const settled = next.every((c, i) => distance(c, centers[i]) < 1e-12)
    centers = next
    if (settled) break
  }
  return points.map((p) => {
    const cluster = nearest(p),
      c = centers[cluster]
    const hue =
      ((Math.atan2(c.y - center.y, c.x - center.x) * 180) / Math.PI + 360) % 360
    return { ...p, cluster, color: `hsl(${hue.toFixed(1)} 65% 48%)` }
  })
}

export function postTimestamp(id: string, createdAt?: string) {
  const parsed = createdAt ? Date.parse(createdAt) : NaN
  if (Number.isFinite(parsed)) return parsed
  if (!/^\d{15,20}$/.test(id)) return null
  return Number((BigInt(id) >> BigInt(22)) + BigInt(1288834974657))
}

export function postMonth(time: number) {
  const date = new Date(time)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)
}

/** Exact timestamps anchor the map; separate lanes keep post cards readable. */
export function timelinePositions(
  posts: { id: string; createdAt?: string }[],
  width: number,
) {
  const sorted = posts
    .map((p) => ({ ...p, time: postTimestamp(p.id, p.createdAt) }))
    .filter((p): p is typeof p & { time: number } => p.time !== null)
    .sort((a, b) => a.time - b.time || a.id.localeCompare(b.id))
  const min = sorted[0]?.time ?? 0,
    max = sorted.at(-1)?.time ?? min
  const ends: number[] = []
  const nodes = sorted.map((p) => {
    const x =
      70 + ((p.time - min) / Math.max(86400000, max - min)) * (width - 280)
    let lane = ends.findIndex((end) => end < x - 15)
    if (lane < 0) lane = ends.length
    ends[lane] = x + 180
    return { ...p, month: postMonth(p.time), x, lane }
  })
  return { nodes, min, max, lanes: Math.max(1, ends.length) }
}
