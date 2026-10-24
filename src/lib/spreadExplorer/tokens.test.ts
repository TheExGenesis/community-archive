import { crc32, normalizeWord, parseHandles, shardOf } from './tokens'

describe('spread explorer tokens', () => {
  it('computes the same CRC32 as ClickHouse and zlib', () => {
    // checked against `SELECT CRC32('abc'), CRC32('vibecoding')` on the export's ClickHouse
    expect(crc32('abc')).toBe(891568578)
    expect(crc32('vibecoding')).toBe(3988115859)
    expect(crc32('')).toBe(0)
  })

  it('hashes non-ASCII tokens over their UTF-8 bytes', () => {
    expect(crc32('café')).toBe(crc32('café'))
    expect(shardOf('日本', 4096)).toBeLessThan(4096)
  })

  it('normalizes a typed word to one token', () => {
    expect(normalizeWord(' Vibecoding ')).toBe('vibecoding')
    expect(normalizeWord('#tpot!')).toBe('tpot')
    expect(normalizeWord('two words')).toBeNull()
    expect(normalizeWord('')).toBeNull()
    expect(normalizeWord(null)).toBeNull()
    expect(normalizeWord('x'.repeat(61))).toBeNull()
  })

  it('parses anchor handles', () => {
    expect(parseHandles('@exgenesis, Visakanv  nosilverv')).toEqual([
      'exgenesis',
      'visakanv',
      'nosilverv',
    ])
    expect(parseHandles('bad-handle, @ok_1')).toEqual(['ok_1'])
    expect(parseHandles('')).toEqual([])
  })
})
