import {
  digestDateInTimeZone,
  getDigestDateWindow,
  isRecentPastDigestDate,
  listPastDigestDates,
} from './dateWindow'

describe('digest date windows', () => {
  test('uses Pacific calendar days for the archive edition', () => {
    expect(getDigestDateWindow('2026-08-11')).toEqual({
      digestDate: '2026-08-11',
      windowStart: '2026-08-11T07:00:00.000Z',
      windowEnd: '2026-08-12T07:00:00.000Z',
    })
  })

  test('preserves a 23-hour day across spring daylight saving time', () => {
    const window = getDigestDateWindow('2026-03-08')
    expect(Date.parse(window.windowEnd) - Date.parse(window.windowStart)).toBe(
      23 * 60 * 60 * 1_000,
    )
  })

  test('lists only completed past dates', () => {
    const now = new Date('2026-08-14T12:00:00.000Z')
    expect(digestDateInTimeZone(now)).toBe('2026-08-14')
    expect(listPastDigestDates(3, now)).toEqual([
      '2026-08-13',
      '2026-08-12',
      '2026-08-11',
    ])
    expect(isRecentPastDigestDate('2026-08-11', now)).toBe(true)
    expect(isRecentPastDigestDate('2026-08-14', now)).toBe(false)
  })
})
