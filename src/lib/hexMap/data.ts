import 'server-only'
import {
  getPublishedDigest,
  getPublishedDigestEditions,
} from '@/lib/digest/data'
import { getPreviewDigestEdition } from '@/lib/digest/mock'
import { getPublishedWeeklyDigest, getWeekSoFar } from '@/lib/digest/weeklyData'
import type { DigestStory } from '@/lib/digest/types'
import { getStrands } from '@/lib/community-apps/data'
import { readMembers } from '@/lib/directoryMembers'
import { filterStrands } from '@/lib/community-apps/strand-list'
import { getStrandTweets } from '@/lib/community-apps/strand-tweets'
import type { PortalTweet } from '@/lib/portal/types'
import { locate, type MapLookup } from './gateway'
import { measureServerRead } from '@/lib/performance/server'
import snapshot from './snapshot.json'
import { selectStories } from './selectStories'
import type { MapStory, StoryPage, StoryDetail, WeeklyMapPage } from './stories'

// Top-level posts must come from current members. Opt-outs are enforced at
// ingestion, so stored quoted context is served as-is.
export async function memberTweets(
  tweets: PortalTweet[],
): Promise<PortalTweet[]> {
  const { members } = await readMembers(tweets.map((t) => t.username))
  return tweets.filter((t) => members.has(t.username.toLowerCase()))
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
    const policy = await readMembers(names)
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
        .filter((name) => policy.members.has(name))
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
  const { stories, lookup } = await checkedDigestStories(
    editions.flatMap((e) =>
      e.content.stories.map((story) => ({ digestDate: e.digestDate, story })),
    ),
  )
  let next = 0
  const page: StoryPage = {
    stories: [],
    editions: editions.map((e) => ({
      date: e.digestDate,
      isPreview: e.isPreview,
      headline: e.content.executiveSummary[0],
      stories: e.content.stories.map(() => stories[next++]),
    })),
    nextOffset: !preview && editions.length === 2 ? offset + 2 : null,
    located: false,
  }
  return { page, lookup }
}

// Daily digest stories as map cards, with only current members' posts
// contributing people. Locations are looked up alongside, not applied.
async function checkedDigestStories(
  items: { digestDate: string; story: DigestStory }[],
): Promise<{ stories: MapStory[]; lookup: MapLookup | null }> {
  const tweets = items.flatMap(({ story: s }) => [
    ...s.bangers,
    ...s.commentary,
  ])
  const names = Array.from(new Set(tweets.map((t) => t.username.toLowerCase())))
  // Overlap independent reads. If candidates exceed the gateway limit, locate
  // the filtered members afterward as before.
  const pendingLookup = names.length <= 300 ? storyLocations(names) : undefined
  const allowed = await measureServerRead('map.stories.members', () =>
    memberTweets(tweets),
  )
  const lookup = await (pendingLookup ??
    storyLocations(allowed.map((t) => t.username)))
  const byId = new Map(allowed.map((t) => [t.id, t]))
  const stories = items.map(
    ({ digestDate, story: s }): MapStory => ({
      id: `${digestDate}/${s.slug}`,
      kind: 'digest',
      title: s.title,
      subtitle: s.subtitle,
      date: digestDate,
      category: s.category ?? 'Story',
      href: `/digest/${digestDate}/${s.slug}`,
      people: people(
        [...s.bangers, ...s.commentary].flatMap((t) =>
          byId.has(t.id) ? [byId.get(t.id)!] : [],
        ),
      ),
      cells: [],
    }),
  )
  return { stories, lookup }
}

function applyLocations(stories: MapStory[], lookup: MapLookup) {
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
}

/**
 * The current Week in Review for the map's browse panel: the running week's
 * edition when it is newer than the latest final week (as /digest/week shows
 * it), else that final week. Each weekly story carries the daily stories it
 * cites, which the map already knows how to highlight and open.
 */
export async function weeklyMapPage(): Promise<WeeklyMapPage> {
  const [latest, soFar] = await Promise.all([
    getPublishedWeeklyDigest(),
    getWeekSoFar(),
  ])
  const running = !!soFar && (!latest || soFar.weekStart > latest.weekStart)
  const edition = running ? soFar : latest
  // The weekly reads report failures as null. A current week always exists
  // once the Week in Review has started, so treat none as unavailable rather
  // than serving (and caching) an empty section.
  if (!edition) throw new Error('Weekly digest unavailable')
  const { content } = edition
  const dates = Array.from(
    new Set(
      content.stories.flatMap((s) => s.dailyStories.map((r) => r.digestDate)),
    ),
  )
  const dailies = new Map(
    await Promise.all(
      dates.map(
        async (date) =>
          [date, await getPublishedDigest(date, { strict: true })] as const,
      ),
    ),
  )
  const refs = content.stories.map((weekly) =>
    weekly.dailyStories.flatMap((ref) => {
      const story = dailies
        .get(ref.digestDate)
        ?.content.stories.find((s) => s.slug === ref.slug)
      return story ? [{ digestDate: ref.digestDate, story }] : []
    }),
  )
  const { stories, lookup } = await checkedDigestStories(refs.flat())
  if (lookup) applyLocations(stories, lookup)
  let next = 0
  return {
    weekStart: content.weekStart,
    weekEnd: content.weekEnd,
    soFar: running,
    throughDate: running ? content.throughDate : undefined,
    stories: content.stories.map((weekly, index) => ({
      id: `${edition.weekStart}/${weekly.slug}`,
      title: weekly.title,
      subtitle: weekly.subtitle,
      // A week-so-far edition has no story pages yet; its stories are
      // anchors on the current week page.
      href: running
        ? `/digest/week#${weekly.slug}`
        : `/digest/week/${edition.weekStart}/${weekly.slug}`,
      days: weekly.days,
      stories: refs[index].map(() => stories[next++]),
    })),
    located: !!lookup,
  }
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
    applyLocations(stories, lookup)
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
