import { parseDigestEditionContent } from './types'
import { AUGUST_11_MOCK_DIGEST, isDigestPreviewEnabled } from './mock'

describe('daily digest preview fixture', () => {
  test('is a valid five-story edition built from the August 11 snapshot', () => {
    expect(
      parseDigestEditionContent(AUGUST_11_MOCK_DIGEST.content),
    ).not.toBeNull()
    expect(AUGUST_11_MOCK_DIGEST).toMatchObject({
      digestDate: '2026-08-11',
      isPreview: true,
    })
    expect(AUGUST_11_MOCK_DIGEST.content.stories).toHaveLength(5)
    expect(AUGUST_11_MOCK_DIGEST.content.source).toMatchObject({
      candidateCount: 252,
      selectedCount: 30,
    })
  })

  test('is enabled for preview and development, but not production by default', () => {
    expect(isDigestPreviewEnabled({ VERCEL_ENV: 'preview' })).toBe(true)
    expect(isDigestPreviewEnabled({ NODE_ENV: 'development' })).toBe(true)
    expect(isDigestPreviewEnabled({ NODE_ENV: 'production' })).toBe(false)
    expect(
      isDigestPreviewEnabled({
        NODE_ENV: 'production',
        DIGEST_MOCK_DATA: 'true',
      }),
    ).toBe(true)
  })
})
