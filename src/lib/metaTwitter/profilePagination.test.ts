import {
  needsProfileTweetFallback,
  resolveProfileChapterYear,
} from './profilePagination'

test('preserves a requested chapter when its scoped request is unavailable', () => {
  expect(
    resolveProfileChapterYear(2025, { available: false, yearCounts: [] }),
  ).toBe(2025)
})

test('rejects an unknown chapter only after a successful scoped request', () => {
  expect(
    resolveProfileChapterYear(2025, {
      available: true,
      yearCounts: [{ year: 2024, count: 3 }],
    }),
  ).toBeNull()
})

test('supplements only profiles with fewer than two overall bangers', () => {
  expect(
    needsProfileTweetFallback(
      { available: true, total: 1, yearCounts: [{ year: 2025, count: 1 }] },
      null,
    ),
  ).toBe(true)
  expect(
    needsProfileTweetFallback(
      {
        available: true,
        total: 1,
        yearCounts: [
          { year: 2025, count: 1 },
          { year: 2024, count: 1 },
        ],
      },
      2025,
    ),
  ).toBe(false)
  expect(
    needsProfileTweetFallback(
      { available: false, total: 0, yearCounts: [] },
      null,
    ),
  ).toBe(false)
})
