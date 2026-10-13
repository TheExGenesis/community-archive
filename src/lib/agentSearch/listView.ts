// How a list in an answer shows its tweets. The agent picks a default with
// the marker's optional third part; the reader can switch between tweets and
// people. Every view shows the same tweets: a people view is the list grouped
// by author, so each person stays backed by what they wrote.
//
//   [[posts: <label> | <source>]]                  tweets, one row each
//   [[posts: <label> | <source> | by author]]      people, all their tweets
//   [[posts: <label> | <source> | people]]         people, tweets folded
//   [[posts: <label> | <source> | people, 2 each]] people, first 2 shown
//
// A list with no label sits inside the prose with no heading.

export type ListView =
  | { kind: 'tweets' }
  /**
   * One group per author, most tweets first. `showcase` is how many of each
   * person's tweets show before the rest fold: 0 folds them all behind the
   * person's row, 'all' shows every one.
   */
  | { kind: 'people'; showcase: number | 'all' }

export const TWEETS_VIEW: ListView = { kind: 'tweets' }

/** Most tweets a person shows unfolded when the agent asks for a number. */
const MAX_SHOWCASE = 5

/**
 * Reads the marker's view hint. Unknown hints fall back to tweets: a list
 * should still show when the agent words its hint differently.
 */
export function parseListView(hint: string | null | undefined): ListView {
  const text = (hint ?? '').trim().toLowerCase()
  if (!text || text === 'tweets') return TWEETS_VIEW
  if (/^(by|grouped by) (author|person|people)$/.test(text)) {
    return { kind: 'people', showcase: 'all' }
  }
  const people = text.match(/^people\b(?:[\s,:]+(\d+)(?:\s+each)?)?$/)
  if (people) {
    const count = people[1] === undefined ? 0 : Number(people[1])
    return { kind: 'people', showcase: Math.min(count, MAX_SHOWCASE) }
  }
  return TWEETS_VIEW
}
