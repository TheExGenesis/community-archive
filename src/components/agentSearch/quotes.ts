const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
}

/** Lower case, words and apostrophes only, so punctuation slips still match. */
function normalize(text: string) {
  return text
    .replace(/&(amp|lt|gt|quot|#39);/g, (entity) => ENTITIES[entity] ?? entity)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^\p{L}\p{N}'\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Whether `quote` is the tweet's own words. An ellipsis may join pieces the
 * tweet has in that order with words between them; case, punctuation and
 * curly apostrophes may differ.
 */
export function isVerbatim(quote: string, tweetText: string) {
  const text = ` ${normalize(tweetText)} `
  const pieces = quote
    .split(/\.{3}|…|\[\s*\.{3}\s*\]|\[…\]/)
    .map(normalize)
    .filter(Boolean)
  if (!pieces.length) return false
  let from = 0
  for (const piece of pieces) {
    const at = text.indexOf(` ${piece} `, from)
    if (at < 0) return false
    from = at + piece.length + 1
  }
  return true
}
