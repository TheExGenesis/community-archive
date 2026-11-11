// Shapes of the static export written by scripts/build-spread-explorer-data.py.

export type SpreadRep = { handle: string; ca: boolean }

export type SpreadRegion = {
  id: number
  name: string
  short: string
  note?: string
  family?: string
  accounts: number
  hexes: number
  x: number
  y: number
  reps: string[]
  terms: string[]
  colour?: string
  colour_dark?: string
}

export type SpreadMeta = {
  version: string
  /** YYYY-MM, in order */
  months: string[]
  hex: {
    x: number[]
    y: number[]
    size: number
    accounts: number[]
    ca: number[]
    reps: SpreadRep[][]
  }
  /** tweets per hex per month: the denominators */
  tweets: number[][]
  tweets_off_map: number[]
  hex_region: number[]
  hex_terms: string[][]
  regions: SpreadRegion[]
  accounts: {
    listed: number
    placed: number
    on_map: number
    with_handle: number
  }
  shards: number
  caveats: string[]
}

export type SpreadWord = {
  word: string
  /** false when the token is not in the export at all */
  known: boolean
  /** uses per hex per month, dense */
  uses: number[][]
  /** uses per month over every account, on or off the map */
  total: number[]
}

export type SpreadAnchor = {
  handle: string
  missing?: boolean
  hex: number
  x: number
  y: number
}

/** [token, uses since 2024] most used first */
export type SpreadVocab = [string, number][]
