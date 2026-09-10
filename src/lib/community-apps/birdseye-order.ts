export const BIRDSEYE_POST_SORTS = ['recent', 'likes', 'bangers'] as const
export type BirdseyePostSort = (typeof BIRDSEYE_POST_SORTS)[number]
export function isBirdseyePostSort(value: string): value is BirdseyePostSort {
  return BIRDSEYE_POST_SORTS.some((sort) => sort === value)
}

/** Rank entire reply groups by their strongest post; retain parent-first order. */
export function orderBirdseyeSources(
  index: { id: string; threadId: string }[],
  sort: BirdseyePostSort,
  likes: Map<string, number>,
  bangers: Map<string, number> = new Map(),
) {
  const groups = new Map<string, typeof index>()
  for (const entry of index) {
    const group = groups.get(entry.threadId) ?? []
    group.push(entry)
    groups.set(entry.threadId, group)
  }
  const newest = (group: typeof index) =>
    group.reduce(
      (latest, { id }) => (BigInt(id) > latest ? BigInt(id) : latest),
      BigInt(0),
    )
  const scores = sort === 'bangers' ? bangers : likes
  const score = (group: typeof index) =>
    Math.max(0, ...group.map(({ id }) => scores.get(id) ?? 0))
  return Array.from(groups.values())
    .sort(
      (a, b) =>
        (sort === 'recent' ? 0 : score(b) - score(a)) ||
        (newest(a) === newest(b) ? 0 : newest(a) > newest(b) ? -1 : 1),
    )
    .flat()
}
