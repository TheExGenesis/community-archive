export interface HexCell {
  x: number
  y: number
  accounts: number
  archived: number
  region: number
  terms: string[]
  activity: number
}

export interface HexRegion {
  id: number
  name: string
  short: string
  note: string
  x: number
  y: number
  color: string
  terms: string[]
}

export interface HexSnapshot {
  version: string
  week: string
  radius: number
  cells: HexCell[]
  regions: HexRegion[]
  clusters?: {
    x: number
    y: number
    label: string
    region: number
    size: number
  }[]
  caveats: string[]
}

export function coverageSummary(cells: HexCell[]) {
  return cells.reduce(
    (sum, cell) => ({
      accounts: sum.accounts + cell.accounts,
      archived: sum.archived + cell.archived,
      occupied: sum.occupied + Number(cell.archived > 0),
    }),
    { accounts: 0, archived: 0, occupied: 0 },
  )
}

export function hexPoints(x: number, y: number, radius: number) {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = ((30 + 60 * i) * Math.PI) / 180
    return `${(x + radius * Math.cos(angle)).toFixed(3)},${(-y + radius * Math.sin(angle)).toFixed(3)}`
  }).join(' ')
}
