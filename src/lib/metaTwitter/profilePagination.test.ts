import { resolveProfileChapterYear } from './profilePagination'

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
