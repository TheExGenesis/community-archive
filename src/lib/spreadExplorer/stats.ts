// The explorer's colour recipe, as in the TPOT spread explorer (static/app.js):
// for each word, log2(rate / the word's overall rate), standardised over all
// usable hexes x months and clipped at +-2.5 sd on the page. The rate is
// (uses + 1) / (tweets + 1/overall rate) in a centred 3-month window, so a quiet
// hex with few tweets sits near average instead of far above it.

export const LOW_TWEETS = 100
export const WINDOW_HALF = 1

/** Sum of row[t-k..t+k] for every t. */
export function winSum(row: number[], k: number): number[] {
  return row.map((_, t) => {
    let s = 0
    for (let i = t - k; i <= t + k; i++) s += row[i] || 0
    return s
  })
}

export function standardise(
  values: number[][],
  usable: (h: number, t: number) => boolean,
): (number | null)[][] {
  let n = 0
  let sum = 0
  let sq = 0
  values.forEach((row, h) =>
    row.forEach((v, t) => {
      if (usable(h, t)) {
        n++
        sum += v
        sq += v * v
      }
    }),
  )
  const mean = sum / n
  const sd = Math.sqrt(Math.max(sq / n - mean * mean, 1e-12))
  return values.map((row, h) =>
    row.map((v, t) => (usable(h, t) ? (v - mean) / sd : null)),
  )
}

export type RealZ = {
  /** standard deviations per hex per month; null where there is too little data */
  z: (number | null)[][]
  /** whether the word was used at all in the window around each month */
  used: boolean[][]
}

/** Standardised real usage, or null when the word has no uses at all. */
export function realZ(uses: number[][], tweets: number[][]): RealZ | null {
  const N = tweets.map((r) => winSum(r, WINDOW_HALF))
  const U = uses.map((r) => winSum(r, WINDOW_HALF))
  const used = U.map((row) => row.map((u) => u > 0))
  const allU = uses.flat().reduce((a, b) => a + b, 0)
  const allN = tweets.flat().reduce((a, b) => a + b, 0)
  if (!allU || !allN) return null
  const p = allU / allN
  const L = U.map((row, h) =>
    row.map((u, t) => Math.log2((u + 1) / (N[h][t] + 1 / p) / p)),
  )
  return { z: standardise(L, (h, t) => N[h][t] >= LOW_TWEETS), used }
}
