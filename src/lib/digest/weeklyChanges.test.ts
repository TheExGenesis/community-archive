import type { WeeklyDigestStory } from './weekly'
import { changeDayLabel, weeklyStoryChanges } from './weeklyChanges'

const story = (
  slug: string,
  refs: Array<[string, string]>,
): WeeklyDigestStory =>
  ({
    slug,
    dailyStories: refs.map(([digestDate, ref]) => ({
      digestDate,
      slug: ref,
      title: ref,
    })),
  }) as unknown as WeeklyDigestStory

describe('weeklyStoryChanges', () => {
  test('marks every story new when there is no earlier edition', () => {
    expect(
      weeklyStoryChanges(
        { stories: [story('a', [['2026-11-10', 'x']])] },
        null,
      ),
    ).toEqual({ a: 'new' })
  })

  test('matches stories by a shared daily story even when the slug changes', () => {
    const previous = {
      stories: [
        story('old-a', [['2026-11-10', 'x']]),
        story('b', [['2026-11-11', 'y']]),
      ],
    }
    const current = {
      stories: [
        // Same coverage under a new slug: unchanged.
        story('new-a', [['2026-11-10', 'x']]),
        // Same slug, new daily coverage: updated.
        story('b', [
          ['2026-11-11', 'y'],
          ['2026-11-12', 'z'],
        ]),
        // Nothing shared: entered the top stories today.
        story('c', [['2026-11-12', 'w']]),
      ],
    }
    expect(weeklyStoryChanges(current, previous)).toEqual({
      b: 'updated',
      c: 'new',
    })
  })

  test('a story merged from two earlier ones is updated only by new coverage', () => {
    const previous = {
      stories: [
        story('a', [['2026-11-10', 'x']]),
        story('b', [['2026-11-11', 'y']]),
      ],
    }
    const merged = {
      stories: [
        story('ab', [
          ['2026-11-10', 'x'],
          ['2026-11-11', 'y'],
        ]),
      ],
    }
    expect(weeklyStoryChanges(merged, previous)).toEqual({})
  })
})

describe('changeDayLabel', () => {
  test("names today and yesterday in the reader's date, else the weekday", () => {
    expect(changeDayLabel('2026-11-14', '2026-11-14')).toBe('today')
    expect(changeDayLabel('2026-11-13', '2026-11-14')).toBe('yesterday')
    expect(changeDayLabel('2026-11-11', '2026-11-14')).toBe('Wednesday')
    expect(changeDayLabel('2026-11-14')).toBe('Saturday')
  })
})
