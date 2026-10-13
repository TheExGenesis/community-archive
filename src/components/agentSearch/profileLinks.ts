import { userProfileHref } from '@/lib/navigation'
import type { PortalTweet } from '@/lib/portal/types'

/** Someone whose tweets the run returned, keyed by lower-case handle. */
export interface Person {
  username: string
  accountId?: string
  name?: string
  avatar?: string | null
  /** One of their tweets, which their avatar is loaded through. */
  tweetId?: string
  /** How many of their tweets the run returned. */
  tweets?: number
  /** Earliest and latest of those tweets, ISO dates. */
  firstAt?: string
  lastAt?: string
}

/** The people behind a run's tweets, each tweet counted once. */
export function peopleFromTweets(
  groups: readonly (readonly PortalTweet[])[],
): Map<string, Person> {
  const people = new Map<string, Person>()
  const seen = new Set<string>()
  for (const tweets of groups) {
    for (const tweet of tweets) {
      if (!tweet.username || seen.has(tweet.id)) continue
      seen.add(tweet.id)
      const key = tweet.username.toLowerCase()
      const person = people.get(key) ?? {
        username: tweet.username,
        accountId: tweet.accountId,
        name: tweet.name,
        avatar: tweet.avatar,
        tweetId: tweet.id,
        tweets: 0,
      }
      person.tweets = (person.tweets ?? 0) + 1
      person.accountId ??= tweet.accountId
      if (!person.avatar && tweet.avatar) {
        person.avatar = tweet.avatar
        person.tweetId = tweet.id
      }
      const at = Number.isFinite(Date.parse(tweet.createdAt))
        ? tweet.createdAt
        : undefined
      if (at && (!person.firstAt || at < person.firstAt)) person.firstAt = at
      if (at && (!person.lastAt || at > person.lastAt)) person.lastAt = at
      people.set(key, person)
    }
  }
  return people
}

export interface MdNode {
  type: string
  value?: string
  url?: string
  data?: Record<string, unknown>
  children?: MdNode[]
}

// An @handle not preceded by a word character, a slash or another @, so
// emails and URLs are left alone.
const HANDLE = /(^|[^\w/@])@(\w{1,15})(?!\w)/g

/**
 * Turns @handles in the answer's text into links to Community Archive
 * profiles, for the people in `people` only. Text already inside a link or
 * code is left as written.
 */
export function remarkProfileLinks(people: ReadonlyMap<string, Person>) {
  const split = (value: string): MdNode[] => {
    const nodes: MdNode[] = []
    let last = 0
    for (const match of Array.from(value.matchAll(HANDLE))) {
      const person = people.get(match[2].toLowerCase())
      if (!person) continue
      const start = (match.index ?? 0) + match[1].length
      if (start > last)
        nodes.push({ type: 'text', value: value.slice(last, start) })
      nodes.push({
        type: 'link',
        url: userProfileHref(person.username, person.accountId),
        children: [{ type: 'text', value: `@${match[2]}` }],
      })
      last = start + match[2].length + 1
    }
    if (!nodes.length) return [{ type: 'text', value }]
    if (last < value.length)
      nodes.push({ type: 'text', value: value.slice(last) })
    return nodes
  }
  const walk = (node: MdNode) => {
    if (
      !node.children ||
      ['link', 'linkReference', 'inlineCode', 'code'].includes(node.type)
    ) {
      return
    }
    node.children = node.children.flatMap((child) => {
      if (child.type === 'text' && child.value) return split(child.value)
      walk(child)
      return [child]
    })
  }
  return () => (tree: MdNode) => walk(tree)
}
