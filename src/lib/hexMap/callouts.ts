import type { MapLabel, Point } from './geometry'

type Box = Point & { width: number; height: number }
type MapFootprint = {
  cells: Point[]
  radius: number
  center: Point
}
export type MapCallout = Point & {
  username: string
  region: number
  highlighted: boolean
}
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y

// Reserve map labels first. Examples favor the map's outside edge; explicit
// searches and self locations retain their visibility fallback.
export function placeCallouts(
  people: MapCallout[],
  labels: MapLabel[],
  measure: (text: string, size: number) => number,
  width: number,
  height: number,
  map?: MapFootprint,
) {
  const occupied: Box[] = labels.map((l) => ({
    x: l.x - (measure(l.text, l.size) + 14) / 2,
    y: l.y - (l.size + 13) / 2,
    width: measure(l.text, l.size) + 14,
    height: l.size + 13,
  }))
  const mapBoxes =
    map?.cells.map((cell) => ({
      x: cell.x - (Math.sqrt(3) * map.radius) / 2,
      y: cell.y - map.radius,
      width: Math.sqrt(3) * map.radius,
      height: map.radius * 2,
    })) ?? []
  const seen = new Set<string>()
  let examples = 0
  return people.flatMap((person) => {
    const key = person.username.toLowerCase()
    if (
      (!person.highlighted && examples >= 3) ||
      seen.has(key) ||
      person.x < 0 ||
      person.x > width ||
      person.y < 0 ||
      person.y > height
    )
      return []
    seen.add(key)
    const w = measure('@' + person.username, 11) + 16,
      h = 24
    const vx = person.x - (map?.center.x ?? person.x),
      vy = person.y - (map?.center.y ?? person.y),
      length = Math.hypot(vx, vy),
      outward = length ? { x: vx / length, y: vy / length } : { x: 1, y: 0 }
    const candidates: { box: Box; score: number }[] = []
    const distances = map ? [32, 52, 76, 104, 144, 192, 256] : [32, 52, 76, 104]
    for (const distance of distances) {
      const directions = [
        [0, -distance],
        [0, distance],
        [-distance - w / 2, -20],
        [distance + w / 2, -20],
        [-distance - w / 2, 20],
        [distance + w / 2, 20],
      ]
      if (map) {
        directions.push(
          [-distance - w / 2, -distance],
          [distance + w / 2, -distance],
          [-distance - w / 2, distance],
          [distance + w / 2, distance],
        )
        const clearance =
          (Math.abs(outward.x) * w) / 2 + (Math.abs(outward.y) * h) / 2
        directions.unshift([
          outward.x * (distance + clearance),
          outward.y * (distance + clearance),
        ])
      }
      for (const [dx, dy] of directions) {
        // Do not send the leader line back across the center of the map.
        if (map && dx * outward.x + dy * outward.y < Math.hypot(dx, dy) * 0.5)
          continue
        const box = {
          x: person.x + dx - w / 2,
          y: person.y + dy - h / 2,
          width: w,
          height: h,
        }
        if (
          box.x < 8 ||
          box.x + w > width - 8 ||
          box.y < 66 ||
          box.y + h > height - 42 ||
          occupied.some((b) => overlaps(box, b))
        )
          continue
        const mapOverlap = mapBoxes.reduce(
          (area, cell) =>
            area +
            Math.max(
              0,
              Math.min(box.x + w, cell.x + cell.width) -
                Math.max(box.x, cell.x),
            ) *
              Math.max(
                0,
                Math.min(box.y + h, cell.y + cell.height) -
                  Math.max(box.y, cell.y),
              ),
          0,
        )
        candidates.push({
          box,
          // Favor clear space without sending a leader across half the map
          // merely to remove the last few pixels of overlap.
          score: map
            ? Math.min(1, mapOverlap / (w * h)) * 240 + Math.hypot(dx, dy)
            : candidates.length,
        })
      }
    }
    candidates.sort((a, b) => a.score - b.score)
    const box = candidates[0]?.box
    if (box) {
      if (!person.highlighted) examples++
      occupied.push({ x: box.x - 4, y: box.y - 4, width: w + 8, height: h + 8 })
      return [
        {
          ...person,
          box,
          pointer: {
            x: Math.max(box.x, Math.min(box.x + w, person.x)),
            y: Math.max(box.y, Math.min(box.y + h, person.y)),
          },
        },
      ]
    }
    // A searched/highlighted account must stay visible even in a dense word
    // cluster. Prefer the collision-free placements above, then keep its label
    // inside the map and let it take priority over background text.
    if (person.highlighted && w <= width - 16 && height >= 132) {
      const box = {
        x: Math.max(8, Math.min(width - w - 8, person.x - w / 2)),
        y: Math.max(66, Math.min(height - h - 42, person.y - 44)),
        width: w,
        height: h,
      }
      occupied.push(box)
      return [
        {
          ...person,
          box,
          pointer: {
            x: Math.max(box.x, Math.min(box.x + w, person.x)),
            y: Math.max(box.y, Math.min(box.y + h, person.y)),
          },
        },
      ]
    }
    return []
  })
}
