export interface RelatedResults<T> {
  items: T[]
  total: number
}

export interface RelatedStrand {
  id: string
  title: string
  summary: string
  username: string
}

export interface RelatedDigestStory {
  digestDate: string
  publishedDate: string
  slug: string
  title: string
  subtitle: string
}

export interface DigestSearchEntry extends RelatedDigestStory {
  category: string | null
  keyword: string
  notes: string
  posts: string
}

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Matches at the start of a word, so "AI" finds "AI safety" but not "said".
const wordStart = (term: string) =>
  new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escapeRegExp(term)}`, 'iu')

/**
 * Stories whose copy contains the whole phrase rank by where it appears
 * (title first, quoted posts last); stories that only contain every word of a
 * multi-word query rank after those. Newer editions win ties.
 */
export function matchDigestStories(
  entries: DigestSearchEntry[],
  query: string,
): DigestSearchEntry[] {
  const phrase = query.trim().replace(/\s+/g, ' ').slice(0, 120)
  if (phrase.length < 2) return []
  const phrasePattern = wordStart(phrase)
  const words = phrase.split(' ').filter((word) => word.length >= 2)
  const wordPatterns = words.length > 1 ? words.map(wordStart) : []

  return entries
    .flatMap((entry) => {
      const fields = [
        entry.title,
        `${entry.category ?? ''} ${entry.keyword}`,
        entry.subtitle,
        entry.notes,
        entry.posts,
      ]
      let rank = fields.findIndex((field) => phrasePattern.test(field))
      if (rank < 0 && wordPatterns.length > 0) {
        const copy = fields.slice(0, 4).join(' ')
        if (wordPatterns.every((pattern) => pattern.test(copy)))
          rank = fields.length
      }
      return rank < 0 ? [] : [{ entry, rank }]
    })
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        b.entry.digestDate.localeCompare(a.entry.digestDate) ||
        a.entry.slug.localeCompare(b.entry.slug),
    )
    .map(({ entry }) => entry)
}
