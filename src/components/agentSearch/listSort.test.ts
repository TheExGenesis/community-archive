import type { PortalTweet } from '@/lib/portal/types'
import { sortPeople, sortTweets } from './listSort'

const tweet = (id: string, username: string, day: number): PortalTweet => ({
  id,
  username,
  name: username,
  avatar: null,
  text: id,
  observedAt: '2025-01-01T00:00:00.000Z',
  createdAt: `2025-01-${String(day).padStart(2, '0')}T00:00:00.000Z`,
  likes: 0,
  rts: 0,
})

// The agent's order: a, b, c, d.
const tweets = [
  tweet('a', 'ann', 3),
  tweet('b', 'bob', 1),
  tweet('c', 'bob', 4),
  tweet('d', 'cat', 2),
]
const ids = (list: PortalTweet[]) => list.map((t) => t.id)

test('relevance puts scored tweets first, highest first, then the agent order', () => {
  const scores = new Map([
    ['c', 0.9],
    ['b', 0.6],
  ])
  expect(
    ids(sortTweets(tweets, { key: 'relevance', ascending: false }, scores)),
  ).toEqual(['c', 'b', 'a', 'd'])
  // With no scores, relevance is the agent's own order.
  expect(
    ids(sortTweets(tweets, { key: 'relevance', ascending: false })),
  ).toEqual(['a', 'b', 'c', 'd'])
})

test('date is newest first, and reversing flips it', () => {
  expect(ids(sortTweets(tweets, { key: 'date', ascending: false }))).toEqual([
    'c',
    'a',
    'd',
    'b',
  ])
  expect(ids(sortTweets(tweets, { key: 'date', ascending: true }))).toEqual([
    'b',
    'd',
    'a',
    'c',
  ])
})

test('people sort by their best tweet, by count, or by their newest tweet', () => {
  const people = [
    { username: 'ann', tweets: [tweets[0]] },
    { username: 'bob', tweets: [tweets[1], tweets[2]] },
    { username: 'cat', tweets: [tweets[3]] },
  ]
  const scores = new Map([
    ['d', 0.95],
    ['b', 0.4],
    ['a', 0.7],
  ])
  const names = (list: typeof people) => list.map((p) => p.username)
  expect(
    names(sortPeople(people, { key: 'relevance', ascending: false }, scores)),
  ).toEqual(['cat', 'ann', 'bob'])
  expect(
    names(sortPeople(people, { key: 'count', ascending: false }, scores)),
  ).toEqual(['bob', 'cat', 'ann'])
  expect(names(sortPeople(people, { key: 'date', ascending: false }))).toEqual([
    'bob',
    'ann',
    'cat',
  ])
  // Each person's tweets follow the same order.
  const bob = sortPeople(
    people,
    { key: 'relevance', ascending: false },
    scores,
  )[2]
  expect(ids(bob.tweets)).toEqual(['b', 'c'])
})
