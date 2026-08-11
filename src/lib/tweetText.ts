const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  quot: '"',
}

const HTML_ENTITY = /&(?:#\d{1,7}|#x[\da-f]{1,6}|amp|apos|gt|lt|quot);/gi
const MAX_DECODE_PASSES = 5

function decodeEntity(entity: string): string {
  const body = entity.slice(1, -1)
  if (!body.startsWith('#')) {
    return NAMED_ENTITIES[body.toLowerCase()] ?? entity
  }

  const isHex = body[1]?.toLowerCase() === 'x'
  const digits = body.slice(isHex ? 2 : 1)
  const codePoint = Number.parseInt(digits, isHex ? 16 : 10)
  if (
    !Number.isInteger(codePoint) ||
    codePoint <= 0 ||
    codePoint > 0x10ffff ||
    (codePoint >= 0xd800 && codePoint <= 0xdfff)
  ) {
    return entity
  }

  return String.fromCodePoint(codePoint)
}

/**
 * Normalize encoded text from Twitter archives before rendering it.
 *
 * Archive sources are inconsistent: some contain ordinary HTML entities while
 * others have been encoded more than once. Decode a small, deterministic HTML
 * subset repeatedly so server and client renders agree. React still escapes the
 * resulting text when it is inserted into the DOM.
 */
export function decodeTweetText(text: string): string {
  let decoded = text

  for (let pass = 0; pass < MAX_DECODE_PASSES; pass += 1) {
    const next = decoded.replace(HTML_ENTITY, decodeEntity)
    if (next === decoded) return decoded
    decoded = next
  }

  return decoded
}
