// Word handling shared by the build script's conventions, the API and the page.
// The export counts whole tokens: lower-cased text, URLs and @mentions removed,
// split on anything that is not a letter, digit or underscore.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

/** CRC-32 (IEEE), the same value as ClickHouse `CRC32()` and Python `zlib.crc32`. */
export function crc32(text: string): number {
  const bytes = new TextEncoder().encode(text)
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++)
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

export function shardOf(token: string, shards: number): number {
  return crc32(token) % shards
}

export const MAX_TOKEN_LENGTH = 60

/**
 * The single token a typed word stands for, or null when the input is empty,
 * too long or more than one word (the export counts one token at a time).
 */
export function normalizeWord(input: string | null | undefined): string | null {
  const tokens = (input ?? '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}_]+/u)
    .filter(Boolean)
  if (tokens.length !== 1 || tokens[0].length > MAX_TOKEN_LENGTH) return null
  return tokens[0]
}

/** Handles typed into the anchors box: `@a, b c` -> ['a', 'b', 'c'], at most 40. */
export function parseHandles(input: string | null | undefined): string[] {
  return Array.from(
    new Set(
      (input ?? '')
        .toLowerCase()
        .split(/[\s,]+/)
        .map((h) => h.replace(/^@/, ''))
        .filter((h) => /^[a-z0-9_]{1,15}$/.test(h)),
    ),
  ).slice(0, 40)
}
