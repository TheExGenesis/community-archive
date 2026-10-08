// The agent cites tweets inline as [[t:<tweet id>]]. Code, not the model,
// decides whether a citation is valid: the id must appear in a tool result
// from the same run (the digest's numbered-corpus rule, keyed by tweet id).

export const CITATION_PATTERN = /\[\[t:(\d{1,20})\]\]/g

export function extractCitationIds(text: string): string[] {
  const ids: string[] = []
  for (const match of Array.from(text.matchAll(CITATION_PATTERN))) {
    if (!ids.includes(match[1])) ids.push(match[1])
  }
  return ids
}

export function validateCitations(
  text: string,
  seenTweetIds: Iterable<string>,
): { cited: string[]; invalid: string[] } {
  const seen = new Set(seenTweetIds)
  const cited: string[] = []
  const invalid: string[] = []
  for (const id of extractCitationIds(text)) {
    ;(seen.has(id) ? cited : invalid).push(id)
  }
  return { cited, invalid }
}

/** Splits answer text into plain segments and citation markers, in order. */
export function splitCitations(
  text: string,
): Array<{ type: 'text'; value: string } | { type: 'cite'; id: string }> {
  const parts: Array<
    { type: 'text'; value: string } | { type: 'cite'; id: string }
  > = []
  let last = 0
  for (const match of Array.from(text.matchAll(CITATION_PATTERN))) {
    const index = match.index ?? 0
    if (index > last)
      parts.push({ type: 'text', value: text.slice(last, index) })
    parts.push({ type: 'cite', id: match[1] })
    last = index + match[0].length
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) })
  return parts
}

/** Collects every tweet id present in tool outputs (AgentTweet-shaped). */
export function collectToolTweetIds(outputs: unknown[]): Set<string> {
  const ids = new Set<string>()
  const visit = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(visit)
    if (!value || typeof value !== 'object') return
    const record = value as Record<string, unknown>
    if (
      typeof record.id === 'string' &&
      /^\d{1,20}$/.test(record.id) &&
      typeof record.text === 'string'
    ) {
      ids.add(record.id)
    }
    Object.values(record).forEach(visit)
  }
  outputs.forEach(visit)
  return ids
}
