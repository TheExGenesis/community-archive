/** Shared ranking contract v2. Keep identical in the gateway and website. */
export type Metric = 'tweets' | 'authors' | 'sqrt'
export type Lane = 'emerging' | 'rising' | 'falling'
export type Counts = [string, number, number, number, number, number, number]
export type Dataset = { through: string; days: 1 | 7; rows: Counts[] }
export type Settings = {
  metric: Metric
  authors: number
  tweets: number
  large: number
  move: number
  breakout: number
  balance: number
  smoothing: number
  phrase: number
  penalty: number
  generic: string
  phrasesOnly: boolean
  collapse: boolean
  dedupePhrases: boolean
  phraseCoverage: number
  fallingMode: 'history' | 'all'
  fallingTweets: number
  fallingAuthors: number
}
export type RankedTerm = {
  term: string
  current: number
  previous: number
  authors: number
  previousAuthors: number
  weightCurrent: number
  weightPrevious: number
  rate: number
  prior: number
  change: number | null
  lane: Lane
  score: number
  base: number
  personalMultiplier: number
  phraseMultiplier: number
  previousHot?: { through: string; lane: Lane }
  rankScore?: number
  collapsedTerms?: { term: string; current: number; previous: number }[]
}
export type Ranking = {
  lanes: Record<Lane, RankedTerm[]>
  all?: Counts
  eligible: number
  historyDates?: string[]
}
export const metrics = {
  tweets: {
    label: 'Tweets',
    unit: 'tweets',
    current: 1,
    previous: 2,
    large: 200,
  },
  authors: {
    label: 'Unique authors',
    unit: 'active authors',
    current: 3,
    previous: 4,
    large: 2000,
  },
  sqrt: {
    label: 'Σ√(posts per author)',
    unit: 'weighted author activity',
    current: 5,
    previous: 6,
    large: 700,
  },
}
export const defaults = (days: number): Settings => ({
  metric: 'sqrt',
  authors: days === 1 ? 3 : 5,
  tweets: days === 1 ? 5 : 20,
  large: 150,
  move: 15,
  breakout: 50,
  balance: 0.7,
  smoothing: days === 1 ? 3 : 10,
  phrase: 200,
  penalty: 90,
  generic: '',
  phrasesOnly: false,
  collapse: true,
  dedupePhrases: true,
  phraseCoverage: 50,
  fallingMode: 'history',
  fallingTweets: days === 1 ? 5 : 20,
  fallingAuthors: days === 1 ? 3 : 5,
})
export function weightedCounts(
  row: Counts,
  metric: Metric = 'tweets',
): [number, number] {
  const spec = metrics[metric]
  if (!spec) throw Error('Unknown activity metric')
  const pair: [number, number] = [
    row[spec.current] as number,
    row[spec.previous] as number,
  ]
  if (pair.some((n) => !Number.isFinite(n) || n < 0))
    throw Error('Missing or invalid activity counts')
  return pair
}
const canonical = (term: string) =>
  term
    .split(' ')
    .map((w) => (w.length > 4 ? w.replace(/s$/, '') : w))
    .join(' ')
export function rank(
  dataset: Dataset,
  settings: Settings,
  stopwords: string[] = [],
  history: Dataset[] = [],
): Ranking {
  const all = dataset.rows.find((r) => r[0] === '__all_tweets__')
  if (!all || !all[1] || !all[2])
    return {
      lanes: { emerging: [], rising: [], falling: [] },
      all,
      eligible: 0,
    }
  const [totalCurrent, totalPrevious] = weightedCounts(all, settings.metric)
  if (!totalCurrent || !totalPrevious) throw Error('Empty activity population')
  const stop = new Set(stopwords),
    generic = new Set(
      settings.generic
        .toLowerCase()
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    )
  const lanes: Record<Lane, RankedTerm[]> = {
    emerging: [],
    rising: [],
    falling: [],
  }
  // Reconstruct earlier top-20 lists with these controls, never the current/future snapshot.
  const earlier = history
    .filter((d) => d.days === dataset.days && d.through < dataset.through)
    .sort((a, b) => a.through.localeCompare(b.through))
  const seenHot = new Map<string, { through: string; lane: Lane }>()
  if (settings.fallingMode === 'history')
    for (const prior of earlier) {
      const past = rank(prior, { ...settings, fallingMode: 'all' }, stopwords)
      for (const lane of ['emerging', 'rising'] as const)
        for (const row of past.lanes[lane].slice(0, 20))
          seenHot.set(canonical(row.term), { through: prior.through, lane })
    }
  for (const row of dataset.rows) {
    const [term, current, previous, authors, previousAuthors] = row
    if (
      term === '__all_tweets__' ||
      term.split(' ').some((w) => stop.has(w)) ||
      (settings.phrasesOnly && !term.includes(' '))
    )
      continue
    const [weightCurrent, weightPrevious] = weightedCounts(row, settings.metric)
    const rate = (weightCurrent / totalCurrent) * 100000,
      prior = (weightPrevious / totalPrevious) * 100000
    const change = weightPrevious ? (rate / prior - 1) * 100 : null
    const large = prior >= settings.large
    const supported = current >= settings.tweets && authors >= settings.authors
    let lane: Lane | undefined
    const previousHot = seenHot.get(canonical(term))
    const fallingEligible =
      settings.fallingMode === 'history' ? Boolean(previousHot) : large
    if (
      fallingEligible &&
      (change ?? 0) <= -settings.move &&
      previous >= Math.max(settings.tweets, settings.fallingTweets ?? 0) &&
      previousAuthors >=
        Math.max(settings.authors, settings.fallingAuthors ?? 0)
    )
      lane = 'falling'
    else if (large && (change ?? 0) >= settings.move && supported)
      lane = 'rising'
    else if (
      !large &&
      (change === null || change >= settings.breakout) &&
      supported
    )
      lane = 'emerging'
    if (!lane) continue
    const absolute = Math.abs(rate - prior)
    const base =
      absolute /
      Math.pow(
        prior + (settings.smoothing / totalPrevious) * 100000,
        settings.balance,
      )
    const phraseMultiplier = term.includes(' ') ? 1 + settings.phrase / 100 : 1
    const personalMultiplier = generic.has(term)
      ? 1 - settings.penalty / 100
      : 1
    lanes[lane].push({
      term,
      current,
      previous,
      authors,
      previousAuthors,
      weightCurrent,
      weightPrevious,
      rate,
      prior,
      change,
      lane,
      score: base * phraseMultiplier * personalMultiplier,
      base,
      personalMultiplier,
      phraseMultiplier,
      previousHot: lane === 'falling' ? previousHot : undefined,
    })
  }
  for (const lane of Object.keys(lanes) as Lane[])
    lanes[lane].sort(
      (a, b) => b.score - a.score || a.term.localeCompare(b.term),
    )
  const eligible = Object.values(lanes).reduce(
    (sum, rows) => sum + rows.length,
    0,
  )
  if (settings.collapse) {
    // Collapse singular/plural spellings; retain phrases and their parent words for inspection.
    for (const lane of Object.keys(lanes) as Lane[]) {
      const seen = new Set()
      lanes[lane] = lanes[lane].filter((row) => {
        const key = canonical(row.term)
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
    }
  }
  if (settings.dedupePhrases)
    for (const lane of Object.keys(lanes) as Lane[]) {
      const rows = lanes[lane],
        phrases = rows.filter((r) => r.term.includes(' '))
      const replacement = new Map<string, RankedTerm>()
      for (const word of rows.filter((r) => !r.term.includes(' '))) {
        const countKey = lane === 'falling' ? 'weightPrevious' : 'weightCurrent'
        const matches = phrases.filter(
          (p) =>
            canonical(p.term).split(' ').includes(canonical(word.term)) &&
            p[countKey] >=
              (word[countKey] * (settings.phraseCoverage ?? 50)) / 100,
        )
        matches.sort(
          (a, b) =>
            b[countKey] - a[countKey] ||
            b.score - a.score ||
            a.term.localeCompare(b.term),
        )
        if (matches.length) replacement.set(word.term, matches[0])
      }
      const groups = new Map<
        string,
        RankedTerm & {
          rankScore: number
          collapsedTerms: { term: string; current: number; previous: number }[]
        }
      >()
      for (const row of rows) {
        const target = replacement.get(row.term) || row
        if (!groups.has(target.term))
          groups.set(target.term, {
            ...target,
            rankScore: target.score,
            collapsedTerms: [],
          })
        const group = groups.get(target.term)!
        group.rankScore = Math.max(group.rankScore, row.score)
        if (target.term !== row.term)
          group.collapsedTerms.push({
            term: row.term,
            current: row.current,
            previous: row.previous,
          })
      }
      lanes[lane] = Array.from(groups.values()).sort(
        (a, b) =>
          (b.rankScore ?? b.score) - (a.rankScore ?? a.score) ||
          a.term.localeCompare(b.term),
      )
    }
  return { lanes, all, eligible, historyDates: earlier.map((d) => d.through) }
}
