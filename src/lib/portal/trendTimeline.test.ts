import { recentBuckets, presetRange } from './trendTimeline'
import { convertedRange, evidenceRange } from '@/components/portal/trends/model'

test('recent windows cross year/leap boundaries and weeks use Monday UTC', () => {
  const days = recentBuckets('day', new Date('2024-03-01T23:00:00Z'))
  expect(days).toHaveLength(90)
  expect(days.slice(-3)).toEqual(['2024-02-28', '2024-02-29', '2024-03-01'])
  expect(presetRange('15d', days)).toEqual({
    start: '2024-02-16',
    end: '2024-03-01',
  })
  const weeks = recentBuckets('week', new Date('2026-01-04T23:59:59Z'))
  expect(weeks).toHaveLength(52)
  expect(weeks.at(-1)).toBe('2025-12-29')
  expect(presetRange('12w', weeks)).toEqual({
    start: '2025-10-13',
    end: '2025-12-29',
  })
})
test('converts complete bucket boundaries without losing the end of a week', () => {
  expect(
    convertedRange({ start: '2026-08-31', end: '2026-08-31' }, 'month', 'week'),
  ).toEqual({ start: '2026-08', end: '2026-09' })
  expect(
    convertedRange({ start: '2024-02', end: '2024-02' }, 'day', 'month'),
  ).toEqual({ start: '2024-02-01', end: '2024-02-29' })
  expect(
    evidenceRange({ start: '2026-08-31', end: '2026-08-31' }, 'week'),
  ).toEqual({ since: '2026-08-31', until: '2026-09-07' })
  expect(
    evidenceRange({ start: '2026-09-01', end: '2026-09-02' }, 'day'),
  ).toEqual({ since: '2026-09-01', until: '2026-09-03' })
})
