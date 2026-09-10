import type { Dataset } from './keyword-ranking'
export type KeywordLab = {
  schemaVersion: 2
  population: 'community_members'
  generatedAt: string
  datasets: Dataset[]
}
export function parseKeywordLab(value: unknown): KeywordLab {
  const bad = () => new Error('Invalid keyword lab response')
  const result = value as KeywordLab
  if (
    !result ||
    result.schemaVersion !== 2 ||
    result.population !== 'community_members' ||
    !Number.isFinite(Date.parse(result.generatedAt)) ||
    !Array.isArray(result.datasets) ||
    result.datasets.length !== 7
  )
    throw bad()
  for (const [index, data] of Array.from(result.datasets.entries())) {
    if (
      !data ||
      !/^\d{4}-\d{2}-\d{2}$/.test(data.through) ||
      !Number.isFinite(Date.parse(data.through)) ||
      new Date(data.through).toISOString().slice(0, 10) !== data.through ||
      ![1, 7].includes(data.days) ||
      !Array.isArray(data.rows) ||
      data.rows.length > 100_000
    )
      throw bad()
    if (
      index &&
      (data.days !== result.datasets[0].days ||
        Date.parse(data.through) -
          Date.parse(result.datasets[index - 1].through) !==
          86_400_000)
    )
      throw bad()
    const seen = new Set<string>()
    const all = data.rows.find(
      (row) => Array.isArray(row) && row[0] === '__all_tweets__',
    )
    if (data.rows.length && !all) throw bad()
    for (const row of data.rows) {
      if (
        !Array.isArray(row) ||
        row.length !== 7 ||
        typeof row[0] !== 'string' ||
        !row[0] ||
        row[0].length > 100 ||
        seen.has(row[0]) ||
        row
          .slice(1)
          .some((n) => typeof n !== 'number' || !Number.isFinite(n) || n < 0) ||
        row.slice(1, 5).some((n) => !Number.isSafeInteger(n))
      )
        throw bad()
      seen.add(row[0])
      for (const [t, a, w] of [
        [1, 3, 5],
        [2, 4, 6],
      ]) {
        const tweets = row[t] as number,
          authors = row[a] as number,
          weight = row[w] as number
        if (
          authors > tweets ||
          weight < authors - 1e-8 ||
          weight > tweets + 1e-8 ||
          (authors === 0 && tweets !== 0) ||
          (all &&
            (tweets > (all[t] as number) ||
              authors > (all[a] as number) ||
              weight > (all[w] as number) + 1e-8))
        )
          throw bad()
      }
    }
  }
  return result
}
