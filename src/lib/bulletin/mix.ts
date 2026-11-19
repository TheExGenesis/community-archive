/** Cards the homepage shows below the daily digest. */
export const HOMEPAGE_BULLETIN_LIMIT = 6
/** The first cards are always offers when there are enough of them. */
export const LEADING_OFFERS = 3
/** After the lead, about one card in this many is an ask. */
export const ASK_EVERY = 3

/**
 * Interleave two already-ranked lists into mostly offers: the first
 * `LEADING_OFFERS` are offers, then asks fill about a third of the total
 * (6 cards: offer, offer, offer, ask, offer, ask). When one side runs out the
 * other fills the rest, so a thin side never leaves empty slots.
 */
export function mixOffersAndAsks<T extends { side: string }>(
  ranked: T[],
  limit = HOMEPAGE_BULLETIN_LIMIT,
): T[] {
  const offers = ranked.filter((o) => o.side === 'offer')
  const asks = ranked.filter((o) => o.side === 'ask')
  const picked: T[] = []
  let o = 0
  let a = 0
  while (picked.length < limit && (o < offers.length || a < asks.length)) {
    const slot = picked.length
    const asksDue = Math.floor((slot + 1) / ASK_EVERY)
    const wantAsk = slot >= LEADING_OFFERS && a < asksDue
    if ((wantAsk && a < asks.length) || o >= offers.length)
      picked.push(asks[a++])
    else picked.push(offers[o++])
  }
  return picked
}
