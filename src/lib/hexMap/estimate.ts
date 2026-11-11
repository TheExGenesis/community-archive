import type { HexSnapshot } from './types'

export type EstimateCell = {
  cell: number
  interactions: number
  partners: number
}
export type Estimate = { cell: number; interactions: number; partners: number }

/**
 * Place an unmapped account from the mapped accounts it replies to and quotes.
 * The region with the most interactions wins (ties: more partners, then lower
 * region id); the pin goes on that region's cell nearest the interaction-
 * weighted centre of its cells there, so it never lands between clusters.
 */
export function estimateCell(
  snapshot: Pick<HexSnapshot, 'cells'>,
  cells: EstimateCell[],
): Estimate | null {
  const regions = new Map<
    number,
    { interactions: number; partners: number; x: number; y: number }
  >()
  for (const { cell, interactions, partners } of cells) {
    const c = snapshot.cells[cell]
    if (!c || !(interactions > 0)) continue
    const r = regions.get(c.region) ?? {
      interactions: 0,
      partners: 0,
      x: 0,
      y: 0,
    }
    r.interactions += interactions
    r.partners += partners
    r.x += c.x * interactions
    r.y += c.y * interactions
    regions.set(c.region, r)
  }
  const ranked = Array.from(regions.entries()).sort(
    ([a, ra], [b, rb]) =>
      rb.interactions - ra.interactions || rb.partners - ra.partners || a - b,
  )
  if (!ranked.length) return null
  const [region, best] = ranked[0]
  const cx = best.x / best.interactions,
    cy = best.y / best.interactions
  let cell = -1,
    distance = Infinity
  snapshot.cells.forEach((c, i) => {
    if (c.region !== region) return
    const d = (c.x - cx) ** 2 + (c.y - cy) ** 2
    if (d < distance) [cell, distance] = [i, d]
  })
  const total = cells.reduce(
    (sum, c) => (snapshot.cells[c.cell] ? sum + c.interactions : sum),
    0,
  )
  const partners = cells.reduce(
    (sum, c) => (snapshot.cells[c.cell] ? sum + c.partners : sum),
    0,
  )
  return cell < 0 ? null : { cell, interactions: total, partners }
}
