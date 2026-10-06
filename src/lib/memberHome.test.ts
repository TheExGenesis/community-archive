import { isArchiveStale, STALE_ARCHIVE_DAYS } from './memberHome'

jest.mock('@/utils/supabase', () => ({ createServerClient: jest.fn() }))
jest.mock('next/headers', () => ({ cookies: jest.fn() }))

const DAY = 24 * 60 * 60 * 1000
const now = Date.parse('2026-09-25T00:00:00Z')

test('an archive is stale once it ends more than the threshold ago', () => {
  const fresh = new Date(now - (STALE_ARCHIVE_DAYS - 1) * DAY).toISOString()
  const stale = new Date(now - (STALE_ARCHIVE_DAYS + 1) * DAY).toISOString()
  expect(isArchiveStale(fresh, now)).toBe(false)
  expect(isArchiveStale(stale, now)).toBe(true)
  expect(isArchiveStale('not a date', now)).toBe(false)
})
