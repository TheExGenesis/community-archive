import type { WeeklyDigestStory } from './weekly'
import { changeDayLabel, weeklyStoryChanges } from './weeklyChanges'
import { runningWeekSoFar } from './weeklyData'

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

describe('running week selection', () => {
  // Beside the change badges: both decide what /digest/week shows.
  const edition = (weekStart: string) =>
    ({ id: weekStart, weekStart, publishedAt: null, content: {} }) as never

  test("leads with the new week from Monday's first week-so-far run", () => {
    // Monday 09:30: last week's final edition and this week's first so-far.
    expect(
      runningWeekSoFar(edition('2026-11-02'), edition('2026-11-09')),
    ).toMatchObject({ weekStart: '2026-11-09' })
  })

  test("keeps last week's final edition until then", () => {
    // Monday 09:00–09:30: the newest so-far row is last week's (archived by
    // the final run, but a failed archive must not win).
    expect(
      runningWeekSoFar(edition('2026-11-02'), edition('2026-11-02')),
    ).toBeNull()
    expect(runningWeekSoFar(edition('2026-11-02'), null)).toBeNull()
    expect(runningWeekSoFar(null, edition('2026-11-09'))).toMatchObject({
      weekStart: '2026-11-09',
    })
  })
})
