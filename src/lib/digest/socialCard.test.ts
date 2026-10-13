import { digestCardAlsoHeadlines, digestCardHeadline } from './socialCard'
import type { DigestEdition } from './types'

jest.mock('next/og', () => ({ ImageResponse: jest.fn() }))

const editionWith = (executiveSummary: string[], titles: string[]) =>
  ({
    content: {
      executiveSummary,
      stories: titles.map((title) => ({ title })),
    },
  }) as DigestEdition

describe('daily digest link-preview card', () => {
  test("leads with the day's main headline as plain text", () => {
    expect(
      digestCardHeadline(
        editionWith(
          ['**AI builders** compare notes.', 'A joke lands.'],
          ['Launch day'],
        ),
      ),
    ).toBe('AI builders compare notes.')
  })

  test('falls back to the lead story title without a summary', () => {
    expect(
      digestCardHeadline(editionWith([], ['The [joke](https://x.com) lands'])),
    ).toBe('The joke lands')
  })

  test('mentions the next two stories, skipping the lead', () => {
    expect(
      digestCardAlsoHeadlines(
        editionWith(['Lead line.'], ['Lead', 'A **second**', 'Third', 'Four']),
      ),
    ).toEqual(['A second', 'Third'])
  })
})
