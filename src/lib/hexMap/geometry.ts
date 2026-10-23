import type { HexSnapshot } from './types'

export type Point = { x: number; y: number }
export type Bounds = Point & { width: number; height: number }
export type Camera = Point & { zoom: number }
export const initialCamera: Camera = { x: 0, y: 0, zoom: 1 }
export const safeTerm = (term: string) =>
  !/\b(fuck\w*|shit\w*|cunt\w*|nigg\w*|bitch\w*|fagg\w*)\b/i.test(term)

export function geometry(snapshot: HexSnapshot) {
  const { cells, radius } = snapshot
  const x = Math.min(...cells.map((c) => c.x)) - radius * 3
  const y = Math.min(...cells.map((c) => -c.y)) - radius * 3
  const bounds = {
    x,
    y,
    width: Math.max(...cells.map((c) => c.x)) - x + radius * 3,
    height: Math.max(...cells.map((c) => -c.y)) - y + radius * 3,
  }
  const vertices = cells.map((c) =>
    Array.from({ length: 6 }, (_, i) => {
      const a = ((30 + i * 60) * Math.PI) / 180
      return { x: c.x + radius * Math.cos(a), y: -c.y + radius * Math.sin(a) }
    }),
  )
  // Match neighbour centres instead of rounded vertices. Source coordinates
  // are rounded independently, so equal polygon edges need not stringify alike.
  const unit = radius / 4
  const centres = new Map<string, number>()
  const key = (x: number, y: number) =>
    `${Math.round(x / unit)},${Math.round(y / unit)}`
  cells.forEach((c, i) => centres.set(key(c.x, -c.y), i))
  const edges: { a: Point; b: Point; cells: number[] }[] = []
  vertices.forEach((vs, id) =>
    vs.forEach((a, i) => {
      const b = vs[(i + 1) % 6]
      const angle = ((60 + i * 60) * Math.PI) / 180
      const c = cells[id]
      const nx = c.x + Math.sqrt(3) * radius * Math.cos(angle)
      const ny = -c.y + Math.sqrt(3) * radius * Math.sin(angle)
      let neighbour: number | undefined
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++) {
          const candidate = centres.get(key(nx + dx * unit, ny + dy * unit))
          if (
            candidate !== undefined &&
            Math.hypot(cells[candidate].x - nx, -cells[candidate].y - ny) <
              radius * 0.02
          )
            neighbour = candidate
        }
      if (neighbour === undefined || neighbour > id)
        edges.push({
          a,
          b,
          cells: neighbour === undefined ? [id] : [id, neighbour],
        })
    }),
  )
  return { bounds, vertices, edges }
}

export function transform(
  bounds: Bounds,
  width: number,
  height: number,
  camera: Camera,
) {
  const scale =
    Math.min(width / bounds.width, height / bounds.height) * camera.zoom
  const cx = bounds.x + bounds.width / 2 + camera.x
  const cy = bounds.y + bounds.height / 2 + camera.y
  return { scale, x: width / 2 - cx * scale, y: height / 2 - cy * scale }
}

export function hitCell(snapshot: HexSnapshot, point: Point) {
  let best = -1,
    distance = Infinity
  snapshot.cells.forEach((c, i) => {
    const d = Math.hypot(c.x - point.x, -c.y - point.y)
    if (d < distance) {
      best = i
      distance = d
    }
  })
  if (best < 0) return null
  const c = snapshot.cells[best]
  const dx = Math.abs(c.x - point.x),
    dy = Math.abs(-c.y - point.y)
  const r = snapshot.radius
  return dx <= (Math.sqrt(3) * r) / 2 &&
    dy <= r &&
    Math.sqrt(3) * dy + dx <= Math.sqrt(3) * r
    ? best
    : null
}

export function selectionOutline(
  edges: ReturnType<typeof geometry>['edges'],
  selected: Set<number>,
) {
  return edges.filter(
    (e) => e.cells.filter((id) => selected.has(id)).length === 1,
  )
}

export function mix(color: string, target: string, amount: number) {
  return (
    '#' +
    [1, 3, 5]
      .map((i) =>
        Math.round(
          parseInt(color.slice(i, i + 2), 16) * (1 - amount) +
            parseInt(target.slice(i, i + 2), 16) * amount,
        )
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  )
}

export type MapLabel = Point & {
  text: string
  size: number
  region: number
  kind: 'country' | 'cluster' | 'word' | 'pin' | 'anchor'
  id?: number
}
export function placeLabels(
  candidates: MapLabel[],
  measure: (text: string, size: number) => number,
  width: number,
  height: number,
) {
  const boxes: { x: number; y: number; w: number; h: number }[] = []
  return candidates.filter((l) => {
    const w = measure(l.text, l.size) + 10,
      h = l.size + 9
    const box = { x: l.x - w / 2, y: l.y - h / 2, w, h }
    if (
      box.x < 8 ||
      box.y < 66 ||
      box.x + w > width - 8 ||
      box.y + h > height - 42
    )
      return false
    if (
      boxes.some(
        (b) =>
          box.x < b.x + b.w &&
          box.x + w > b.x &&
          box.y < b.y + b.h &&
          box.y + h > b.y,
      )
    )
      return false
    boxes.push(box)
    return true
  })
}

// Selected coverage always uses luminance in the same direction in both themes.
export function selectedArchiveColor(color: string, strength: number | null) {
  return strength === null
    ? mix(color, '#18181b', 0.65)
    : mix(color, '#ffffff', 0.15 + strength * 0.35)
}
