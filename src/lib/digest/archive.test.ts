import { AUGUST_11_MOCK_DIGEST } from './mock'
import { mergeDigestCalendarDays } from './archive'

const august12 = {
  ...AUGUST_11_MOCK_DIGEST,
  id: 'published-august-12',
  digestDate: '2026-08-12',
  isPreview: false,
}

describe('mergeDigestCalendarDays', () => {
  test('keeps preview days alongside every fetched public digest day', () => {
    expect(
      mergeDigestCalendarDays([august12], AUGUST_11_MOCK_DIGEST).map(
        ({ digestDate }) => digestDate,
      ),
    ).toEqual(['2026-08-12', '2026-08-11'])
  })

  test('prefers a real publication over preview data for the same day', () => {
    const publishedAugust11 = {
      ...AUGUST_11_MOCK_DIGEST,
      id: 'published-august-11',
      isPreview: false,
    }

    expect(
      mergeDigestCalendarDays([publishedAugust11], AUGUST_11_MOCK_DIGEST),
    ).toEqual([publishedAugust11])
  })
})
