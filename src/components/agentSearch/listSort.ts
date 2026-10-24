import type { PortalTweet } from '@/lib/portal/types'

// How a list in an answer orders its tweets and people.
//   relevance: the relevance check's probability, highest first; tweets it
//              never scored keep the agent's order after the scored ones.
//              With no scores at all this is the agent's own order, which
//              the prompt asks to be best first.
//   count:     people with the most tweets in the list first.
//   date:      newest first.
// Reversing flips whichever is chosen.

export type SortKey = 'relevance' | 'count' | 'date'

export interface ListSort {
  key: SortKey
  ascending: boolean
}

export const DEFAULT_SORT: ListSort = { key: 'relevance', ascending: false }

type Scores = ReadonlyMap<string, number>

const time = (tweet: PortalTweet) => {
  const at = Date.parse(tweet.createdAt)
  return Number.isFinite(at) ? at : 0
}

/** Highest first, then the list's own order: a stable descending sort. */
function byDescending<T>(items: readonly T[], value: (item: T) => number) {
  return items
    .map((item, index) => ({ item, index, value: value(item) }))
    .sort((a, b) => b.value - a.value || a.index - b.index)
    .map(({ item }) => item)
}

const relevance = (scores: Scores | undefined) => (tweet: PortalTweet) =>
  scores?.get(tweet.id) ?? -1

export function sortTweets(
  tweets: readonly PortalTweet[],
  sort: ListSort,
  scores?: Scores,
): PortalTweet[] {
  const sorted =
    sort.key === 'date'
      ? byDescending(tweets, time)
      : byDescending(tweets, relevance(scores))
  return sort.ascending ? sorted.reverse() : sorted
}

export interface PersonTweets {
  username: string
  tweets: PortalTweet[]
}

/** People ordered by the sort; each person's tweets ordered the same way. */
export function sortPeople<P extends PersonTweets>(
  people: readonly P[],
  sort: ListSort,
  scores?: Scores,
): P[] {
  const score = relevance(scores)
  const best = (person: P) => Math.max(...person.tweets.map(score))
  const latest = (person: P) => Math.max(...person.tweets.map(time))
  const ordered =
    sort.key === 'count'
      ? byDescending(byDescending(people, best), (p) => p.tweets.length)
      : sort.key === 'date'
        ? byDescending(people, latest)
        : byDescending(
            byDescending(people, (p) => p.tweets.length),
            best,
          )
  const tweetSort: ListSort = {
    key: sort.key === 'date' ? 'date' : 'relevance',
    ascending: false,
  }
  const result = ordered.map((person) => ({
    ...person,
    tweets: sortTweets(person.tweets, tweetSort, scores),
  }))
  return sort.ascending ? result.reverse() : result
}

/** Whether the relevance check scored any of these tweets. */
export const hasScores = (tweets: readonly PortalTweet[], scores?: Scores) =>
  Boolean(scores && tweets.some((tweet) => scores.has(tweet.id)))
