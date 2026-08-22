import {
  digestDateForCommunityDay,
  getDigestDateWindow,
  getLatestCompletedDigestDate,
  isRecentPastDigestDate,
  listPastDigestDates,
} from './dateWindow'

describe('digest date windows', () => {
  test('uses the 06:00 UTC Community Archive day boundary', () => {
    expect(getDigestDateWindow('2026-08-11')).toEqual({
      digestDate: '2026-08-11',
      windowStart: '2026-08-11T06:00:00.000Z',
      windowEnd: '2026-08-12T06:00:00.000Z',
    })
  })

  test('keeps every digest day exactly 24 hours across daylight saving time', () => {
    const window = getDigestDateWindow('2026-03-08')
    expect(Date.parse(window.windowEnd) - Date.parse(window.windowStart)).toBe(
      24 * 60 * 60 * 1_000,
    )
  })

  test('puts European morning and the same-date West Coast evening together', () => {
    expect(digestDateForCommunityDay(new Date('2026-08-11T06:30:00Z'))).toBe(
      '2026-08-11',
    )
    expect(digestDateForCommunityDay(new Date('2026-08-12T03:30:00Z'))).toBe(
      '2026-08-11',
    )
    expect(digestDateForCommunityDay(new Date('2026-01-11T07:30:00Z'))).toBe(
      '2026-01-11',
    )
    expect(digestDateForCommunityDay(new Date('2026-01-12T04:30:00Z'))).toBe(
      '2026-01-11',
    )
  })

  test('lists only completed past dates', () => {
    const now = new Date('2026-08-14T12:00:00.000Z')
    expect(digestDateForCommunityDay(now)).toBe('2026-08-14')
    expect(listPastDigestDates(3, now)).toEqual([
      '2026-08-13',
      '2026-08-12',
      '2026-08-11',
    ])
    expect(isRecentPastDigestDate('2026-08-11', now)).toBe(true)
    expect(isRecentPastDigestDate('2026-08-14', now)).toBe(false)
  })

  test('selects the latest completed edition on either side of the cutoff', () => {
    expect(
      getLatestCompletedDigestDate(new Date('2026-08-21T05:59:59.000Z')),
    ).toBe('2026-08-19')
    expect(
      getLatestCompletedDigestDate(new Date('2026-08-21T06:15:00.000Z')),
    ).toBe('2026-08-20')
  })

  test('allows completed days across the twelve-month generation calendar', () => {
    const now = new Date('2026-08-14T12:00:00.000Z')
    expect(isRecentPastDigestDate('2025-08-14', now, 365)).toBe(true)
    expect(isRecentPastDigestDate('2025-08-13', now, 365)).toBe(false)
  })
})
