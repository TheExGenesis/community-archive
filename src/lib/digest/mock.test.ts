import { parseDigestEditionContent } from './types'
import { AUGUST_11_MOCK_DIGEST, isDigestPreviewEnabled } from './mock'

describe('daily digest preview fixture', () => {
  test('is a valid preview edition', () => {
    expect(
      parseDigestEditionContent(AUGUST_11_MOCK_DIGEST.content),
    ).not.toBeNull()
    expect(AUGUST_11_MOCK_DIGEST).toMatchObject({
      digestDate: '2026-08-11',
      isPreview: true,
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

  test('normalizes labels from editions saved under the prior taxonomy', () => {
    const legacy = structuredClone(AUGUST_11_MOCK_DIGEST.content)
    legacy.stories[0].category =
      'AI' as (typeof legacy.stories)[number]['category']
    legacy.stories[1].category =
      'joke' as (typeof legacy.stories)[number]['category']

    expect(
      parseDigestEditionContent(legacy)
        ?.stories.slice(0, 2)
        .map((story) => story.category),
    ).toEqual(['AI news', 'Viral joke'])
  })

  test('keeps editions with the former prose abstract readable', () => {
    const legacy = structuredClone(
      AUGUST_11_MOCK_DIGEST.content,
    ) as unknown as {
      executiveSummary: string
    }
    legacy.executiveSummary = 'A legacy one-paragraph abstract.'

    expect(parseDigestEditionContent(legacy)?.executiveSummary).toEqual([
      'A legacy one-paragraph abstract.',
    ])
  })
})
