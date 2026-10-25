import 'server-only'
import {
  getPublishedDigest,
  getPublishedDigestEditions,
} from '@/lib/digest/data'
import { getPreviewDigestEdition } from '@/lib/digest/mock'
import { getAppPolicy, getStrands } from '@/lib/community-apps/data'
import { filterStrands } from '@/lib/community-apps/strand-list'
import { getStrandTweets } from '@/lib/community-apps/strand-tweets'
import type { PortalTweet } from '@/lib/portal/types'
import { locate, type MapLookup } from './gateway'
import { measureServerRead } from '@/lib/performance/server'
import snapshot from './snapshot.json'
import { selectStories } from './selectStories'
import type { MapStory, StoryPage, StoryDetail } from './stories'

// Recheck current membership as well as opt-outs even for published snapshots.
// Top-level posts must be members; quoted context follows the permalink opt-out policy.
export async function memberTweets(
  tweets: PortalTweet[],
): Promise<PortalTweet[]> {
  const policy = await getAppPolicy(
    tweets.flatMap((t) => [
      t.username,
      ...(t.quotedTweet ? [t.quotedTweet.username] : []),
    ]),
  )
  const allowed = (t: { username: string; accountId?: string }) =>
    policy.members.has(t.username.toLowerCase()) &&
    !policy.blocked.has(t.username.toLowerCase()) &&
    !policy.blockedIds.has(t.accountId ?? '')
  return tweets.filter(allowed).map((t) => ({
    ...t,
    quotedTweet:
      t.quotedTweet &&
      !policy.blocked.has(t.quotedTweet.username.toLowerCase()) &&
      !policy.blockedIds.has(t.quotedTweet.accountId ?? '')
        ? t.quotedTweet
        : undefined,
  }))
}

function people(tweets: PortalTweet[]) {
  return Array.from(
    new Map(
      tweets.map((t) => [
        t.username.toLowerCase(),
        { username: t.username, avatar: t.avatar },
      ]),
    ).values(),
  )
}

// Location candidates are private server-side input. Only freshly checked
// members contribute people or cells to the response. Location failures remain
// optional for browse, but community-filtered requests fail closed.
async function storyLocations(names: string[]): Promise<MapLookup | null> {
  try {
    return await measureServerRead('map.stories.locations', () => locate(names))
  } catch {
    return null
  }
}

async function unlocatedStoryPage(
  kind: 'digest' | 'strand',
  offset: number,
): Promise<{ page: StoryPage; lookup: MapLookup | null }> {
  if (kind === 'strand') {
    const { strands } = await getStrands()
    const sorted = filterStrands(strands, '')
    const page = sorted.slice(offset, offset + 12)
    // Cards need names and avatars, not twelve complete tweet/thread reads.
    // Bound participants per card; full evidence is fetched only on open.
    const names = Array.from(
      new Set(
        page
          .flatMap((s) => [s.username, ...s.participants.slice(0, 24)])
          .map((name) => name.toLowerCase()),
      ),
    ).filter((name) => /^[a-z0-9_]{1,15}$/.test(name))
    const policy = await getAppPolicy(names)
    const stories: MapStory[] = page.map((s) => ({
      id: s.id,
      kind,
      title: s.title,
      subtitle: s.summary.split(/\n\n/)[0],
      date: s.createdAt,
      category: 'Strand',
      href: `/strands/${s.id}`,
      totalPosts: s.totalPosts,
      people: Array.from(
        new Set(
          [s.username, ...s.participants.slice(0, 24)].map((name) =>
            name.toLowerCase(),
          ),
        ),
      )
        .filter((name) => policy.members.has(name) && !policy.blocked.has(name))
        .map((username) => ({
          username,
          avatar: policy.avatars.get(username) ?? null,
        })),
      cells: [],
    }))
    return {
      page: {
        stories,
        editions: [],
        nextOffset:
          offset + page.length < sorted.length ? offset + page.length : null,
        located: false,
      },
      lookup: await storyLocations(
        stories.flatMap((s) => s.people.map((p) => p.username)),
      ),
    }
  }
  const preview = getPreviewDigestEdition()
  let editions
  if (preview) editions = offset === 0 ? [preview] : []
  else editions = await getPublishedDigestEditions(offset)
  const tweets = editions.flatMap((e) =>
    e.content.stories.flatMap((s) => [...s.bangers, ...s.commentary]),
  )
  const names = Array.from(new Set(tweets.map((t) => t.username.toLowerCase())))
  // Overlap independent reads without caching consent decisions. If candidates
  // exceed the gateway limit, locate the checked members afterward as before.
  const pendingLookup = names.length <= 300 ? storyLocations(names) : undefined
  const allowed = await measureServerRead('map.stories.policy', () =>
    memberTweets(tweets),
  )
  const lookup = await (pendingLookup ??
    storyLocations(allowed.map((t) => t.username)))
  const byId = new Map(allowed.map((t) => [t.id, t]))
  const page: StoryPage = {
    stories: [],
    editions: editions.map((e) => ({
      date: e.digestDate,
      isPreview: e.isPreview,
      headline: e.content.executiveSummary[0],
      stories: e.content.stories.map((s) => ({
        id: `${e.digestDate}/${s.slug}`,
        kind,
        title: s.title,
        subtitle: s.subtitle,
        date: e.digestDate,
        category: s.category ?? 'Story',
        href: `/digest/${e.digestDate}/${s.slug}`,
        people: people(
          [...s.bangers, ...s.commentary].flatMap((t) =>
            byId.has(t.id) ? [byId.get(t.id)!] : [],
          ),
        ),
        cells: [],
      })),
    })),
    nextOffset: !preview && editions.length === 2 ? offset + 2 : null,
    located: false,
  }
  return { page, lookup }
}

export async function storyDetail(
  kind: 'digest' | 'strand',
  id: string,
): Promise<StoryDetail | null> {
  if (kind === 'digest') {
    const slash = id.indexOf('/'),
      date = id.slice(0, slash),
      slug = id.slice(slash + 1)
    const edition = await getPublishedDigest(date, { strict: true })
    const story = edition?.content.stories.find((s) => s.slug === slug)
    if (!story) return null
    const ids = Array.from(
      new Set([...story.bangers, ...story.commentary].map((t) => t.id)),
    )
    // Published summaries can lack quote/media hydration. Use the same live card
    // source as strand/permalink views, preserving the focal-post ordering.
    const loaded = await getStrandTweets(ids)
    const tweets = await memberTweets(
      ids.flatMap((id) => (loaded.has(id) ? [loaded.get(id)!] : [])),
    )
    return { tweets: tweets.map((tweet) => ({ tweet })) }
  }
  const { strands } = await getStrands()
  const strand = strands.find((s) => s.id === id)
  if (!strand) return null
  const ids = Array.from(
    new Set([strand.id, ...strand.essentialTweets.map((t) => t.id)]),
  )
  const loaded = await getStrandTweets(ids)
  const allowed = new Map(
    (await memberTweets(Array.from(loaded.values()))).map((t) => [t.id, t]),
  )
  return {
    tweets: ids.flatMap((id) =>
      allowed.has(id)
        ? [
            {
              tweet: allowed.get(id)!,
              annotation: strand.essentialTweets.find((t) => t.id === id)
                ?.annotation,
            },
          ]
        : [],
    ),
  }
}

export async function storyPage(
  kind: 'digest' | 'strand',
  offset: number,
  cells: number[] = [],
): Promise<StoryPage> {
  const { page, lookup } = await unlocatedStoryPage(kind, offset)
  const stories = [...page.stories, ...page.editions.flatMap((e) => e.stories)]
  if (lookup) {
    const byName = new Map(
      lookup.people.map((p) => [p.username.toLowerCase(), p.cell]),
    )
    for (const story of stories) {
      story.people = story.people.map((p) => ({
        ...p,
        cell: byName.get(p.username.toLowerCase()),
      }))
      story.cells = Array.from(
        new Set(
          story.people.flatMap((p) =>
            byName.has(p.username.toLowerCase())
              ? [byName.get(p.username.toLowerCase())!]
              : [],
          ),
        ),
      )
      story.origin = story.cells[0]
      story.country =
        story.origin === undefined
          ? undefined
          : snapshot.regions.find(
              (r) => r.id === snapshot.cells[story.origin!].region,
            )?.short
    }
    page.located = true
  } else if (cells.length) {
    throw new Error('Story locations unavailable')
  }
  return selectStories(page, cells, snapshot)
}

export async function locatedDetail(
  kind: 'digest' | 'strand',
  id: string,
): Promise<StoryDetail | null> {
  const detail = await storyDetail(kind, id)
  if (!detail) return null
  try {
    const lookup = await locate(detail.tweets.map((t) => t.tweet.username))
    const byName = new Map(
      lookup.people.map((p) => [p.username.toLowerCase(), p.cell]),
    )
    detail.tweets = detail.tweets.map((t) => ({
      ...t,
      cell: byName.get(t.tweet.username.toLowerCase()),
    }))
  } catch {
    /* A story remains readable while the optional map is unavailable. */
  }
  return detail
}
