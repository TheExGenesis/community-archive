/** The curation API accepts at most this many work keys per call. */
export const SHELF_CURATION_BATCH = 500

export function chunkKeys<T>(keys: T[], size = SHELF_CURATION_BATCH): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < keys.length; i += size)
    chunks.push(keys.slice(i, i + size))
  return chunks
}

/**
 * Shift-click selection: every key between the anchor and the target, in
 * the order shown. Falls back to the target alone when the anchor is not in
 * the same list.
 */
export function rangeBetween(order: string[], anchor: string, target: string) {
  const from = order.indexOf(anchor)
  const to = order.indexOf(target)
  if (from < 0 || to < 0) return [target]
  return order.slice(Math.min(from, to), Math.max(from, to) + 1)
}

/** Add or remove keys as one step, the way a checkbox group toggles. */
export function toggleKeys(
  selected: ReadonlySet<string>,
  keys: string[],
  on: boolean,
) {
  const next = new Set(selected)
  for (const key of keys) {
    if (on) next.add(key)
    else next.delete(key)
  }
  return next
}
