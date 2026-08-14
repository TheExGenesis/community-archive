import { parseDigestEditionContent } from './types'
import { AUGUST_11_MOCK_DIGEST, isDigestPreviewEnabled } from './mock'
import { firstStoryMedia } from './storyMedia'

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
    expect(AUGUST_11_MOCK_DIGEST.content.executiveSummary).toHaveLength(3)
    expect(AUGUST_11_MOCK_DIGEST.content.source).toMatchObject({
      candidateCount: 252,
      selectedCount: 30,
    })
    expect(
      AUGUST_11_MOCK_DIGEST.content.stories.map((story) => story.category),
    ).toEqual(['AI news', 'Viral joke', 'AI news', 'Meme', 'AI news'])
    expect(AUGUST_11_MOCK_DIGEST.content.topBanger.text).toContain(
      'True and pure moon-posting is done from reverence and love.',
    )
    expect(
      AUGUST_11_MOCK_DIGEST.content.stories.every((story) =>
        [...story.bangers, ...story.commentary].some((tweet) =>
          tweet.text
            .replace(/\s+/g, ' ')
            .toLocaleLowerCase('en-US')
            .includes(
              story.title.replace(/\s+/g, ' ').toLocaleLowerCase('en-US'),
            ),
        ),
      ),
    ).toBe(true)
    expect(
      AUGUST_11_MOCK_DIGEST.content.stories.every((story) =>
        Boolean(firstStoryMedia(story)),
      ),
    ).toBe(true)
    expect(
      AUGUST_11_MOCK_DIGEST.content.stories.every(
        (story) => story.commentary.length >= 2,
      ),
    ).toBe(true)
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
