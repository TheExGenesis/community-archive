import type { StoryPage } from './stories'
import type { HexSnapshot } from './types'

// Shared by the API and browser so reusing a checked browse page has exactly
// the same selection/fallback behavior. Never mutate the shared browse page.
export function selectStories(
  page: StoryPage,
  cells: number[],
  snapshot: Pick<HexSnapshot, 'cells'>,
): StoryPage {
  if (!cells.length) return page
  if (!page.located) throw new Error('Story locations unavailable')
  const selected = new Set(cells)
  const countries = new Set(cells.map((c) => snapshot.cells[c]?.region))
  const stories = [...page.stories, ...page.editions.flatMap((e) => e.stories)]
  const exact = stories.some((s) => s.cells.some((c) => selected.has(c)))
  const keep = (story: (typeof stories)[number]) =>
    story.cells.some((c) =>
      exact ? selected.has(c) : countries.has(snapshot.cells[c]?.region),
    )
  return {
    ...page,
    stories: page.stories.filter(keep),
    editions: page.editions
      .map((e) => ({ ...e, stories: e.stories.filter(keep) }))
      .filter((e) => e.stories.length),
    countryFallback: !exact,
  }
}
