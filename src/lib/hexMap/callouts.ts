import type { MapLabel, Point } from './geometry'

type Box = Point & { width: number; height: number }
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

// Reserve map labels first, then place compact callouts in nearby free space.
export function placeCallouts(
  people: MapCallout[],
  labels: MapLabel[],
  measure: (text: string, size: number) => number,
  width: number,
  height: number,
) {
  const occupied: Box[] = labels.map((l) => ({
    x: l.x - (measure(l.text, l.size) + 14) / 2,
    y: l.y - (l.size + 13) / 2,
    width: measure(l.text, l.size) + 14,
    height: l.size + 13,
  }))
  const seen = new Set<string>()
  return people.flatMap((person) => {
    const key = person.username.toLowerCase()
    if (
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
    for (const distance of [32, 52, 76, 104]) {
      for (const [dx, dy] of [
        [0, -distance],
        [0, distance],
        [-distance - w / 2, -20],
        [distance + w / 2, -20],
        [-distance - w / 2, 20],
        [distance + w / 2, 20],
      ]) {
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
        occupied.push({
          x: box.x - 4,
          y: box.y - 4,
          width: w + 8,
          height: h + 8,
        })
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
    }
    return []
  })
}
