import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ProfilePreview } from '@/app/api/profile/[account_id]/preview/route'
import { resolveProfileCore } from '@/lib/metaTwitter/profile'
import { getPublishedDigest } from './data'
import { createDigestReadClient } from './database'
import { isRecord } from './types'
import {
  dailyPreviewKey,
  handlesIn,
  weeklyPeople,
  weeklyPreviewKey,
  type WeeklyDigestContent,
  type WeeklyRefPreview,
} from './weekly'

export type { WeeklyRefPreview } from './weekly'

export interface WeeklyDigestEdition {
  id: string
  weekStart: string
  publishedAt: string | null
  content: WeeklyDigestContent
}

type WeeklyRow = {
  id: string
  week_start: string
  published_at: string | null
  content: unknown
}

const WEEK_PATTERN = /^\d{4}-\d{2}-\d{2}$/
// Anonymous readers may select only these columns (see the migration).
const PUBLIC_COLUMNS = 'id,week_start,published_at,content'

/** Reject tombstones and anything that is not a weekly edition body. */
export function parseWeeklyDigestContent(
  value: unknown,
): WeeklyDigestContent | null {
  if (!isRecord(value) || value.policy_tombstone === true) return null
  if (
    typeof value.weekStart !== 'string' ||
    typeof value.weekEnd !== 'string' ||
    !Array.isArray(value.executiveSummary) ||
    !Array.isArray(value.stories)
  ) {
    return null
  }
  const content = value as unknown as WeeklyDigestContent
  return {
    ...content,
    dek: typeof content.dek === 'string' ? content.dek : '',
    alsoNotable: Array.isArray(content.alsoNotable) ? content.alsoNotable : [],
    stories: content.stories.map((story) => ({
      ...story,
      overview: story.overview ?? '',
      titleIsQuote: story.titleIsQuote ?? false,
      titleKind: story.titleKind ?? 'voice',
      subtitle: story.subtitle ?? story.overview ?? '',
      featuredTweetIds: story.featuredTweetIds ?? [],
      continuesFrom: story.continuesFrom ?? [],
      dailyStories: story.dailyStories ?? [],
      days: story.days ?? [],
      segments: story.segments ?? [],
      tweets: story.tweets ?? [],
      trendTerms: story.trendTerms ?? [],
    })),
  }
}

const mapRow = (row: WeeklyRow): WeeklyDigestEdition | null => {
  const content = parseWeeklyDigestContent(row.content)
  return content
    ? {
        id: row.id,
        weekStart: row.week_start,
        publishedAt: row.published_at,
        content,
      }
    : null
}

// The typed digest client does not know this table yet; reads go through the
// same anon/RLS client with explicit public columns.
const weeklyTable = () =>
  (createDigestReadClient() as unknown as SupabaseClient).from(
    'digest_weekly_editions',
  )

async function readPublishedWeeklyDigest(
  weekStart?: string,
): Promise<WeeklyDigestEdition | null> {
  if (weekStart && !WEEK_PATTERN.test(weekStart)) return null
  let query = weeklyTable()
    .select(PUBLIC_COLUMNS)
    .eq('status', 'published')
    .order('week_start', { ascending: false })
    .limit(1)
  if (weekStart) query = query.eq('week_start', weekStart)
  const { data, error } = await query
  if (error) {
    console.error('Published weekly digest read failed:', error.message)
    return null
  }
  const row = (data as WeeklyRow[] | null)?.[0]
  return row ? mapRow(row) : null
}

// Published editions change at most weekly; sharing reads across requests for
// as long as the pages' own revalidate window keeps the week pages cacheable
// (the read client's fetches are uncached, which would make them dynamic).
const SHARED_READ_SECONDS = 300

const requestCache =
  cache ?? ((loader: typeof readPublishedWeeklyDigest) => loader)
export const getPublishedWeeklyDigest = requestCache(
  (weekStart?: string): Promise<WeeklyDigestEdition | null> =>
    unstable_cache(
      () => readPublishedWeeklyDigest(weekStart),
      ['weekly-digest-edition', weekStart ?? 'latest'],
      { revalidate: SHARED_READ_SECONDS },
    )(),
)

async function readWeekSoFar(): Promise<WeeklyDigestEdition | null> {
  const { data, error } = await weeklyTable()
    .select(PUBLIC_COLUMNS)
    .eq('status', 'in_progress')
    .order('week_start', { ascending: false })
    .limit(1)
  if (error) {
    console.error('Week-so-far digest read failed:', error.message)
    return null
  }
  const row = (data as WeeklyRow[] | null)?.[0]
  return row ? mapRow(row) : null
}

/**
 * The newest provisional edition for a week that is still running, refreshed
 * each morning. Callers show it only when it is newer than the latest final
 * week (the final edition archives it, but a failed archive must not win).
 */
export const getWeekSoFar = (): Promise<WeeklyDigestEdition | null> =>
  unstable_cache(readWeekSoFar, ['weekly-digest-week-so-far'], {
    revalidate: SHARED_READ_SECONDS,
  })()

/** Published week starts, newest first, for navigation. */
export const listPublishedWeeks = (limit = 26): Promise<string[]> =>
  unstable_cache(
    () => readPublishedWeeks(limit),
    ['weekly-digest-weeks', String(limit)],
    { revalidate: SHARED_READ_SECONDS },
  )()

/**
 * How many of the newest published weeks each deploy renders ahead of time, so
 * no reader waits for a cold render after a release. Older weeks still render
 * on their first visit.
 */
export const PREBUILT_WEEKS = 4

/** Route params for the newest published weeks and their stories. */
export async function prebuiltWeeklyParams(): Promise<
  { weekStart: string; slugs: string[] }[]
> {
  const weeks = await listPublishedWeeks(PREBUILT_WEEKS)
  const editions = await Promise.all(weeks.map(getPublishedWeeklyDigest))
  return editions.flatMap((edition) =>
    edition
      ? [
          {
            weekStart: edition.weekStart,
            slugs: edition.content.stories.map((story) => story.slug),
          },
        ]
      : [],
  )
}

async function readPublishedWeeks(limit: number): Promise<string[]> {
  const { data, error } = await weeklyTable()
    .select('week_start')
    .eq('status', 'published')
    .order('week_start', { ascending: false })
    .limit(limit)
  if (error) return []
  return ((data as { week_start: string }[] | null) ?? []).map(
    ({ week_start }) => week_start,
  )
}

const previewDay = (date: string) =>
  new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`))

/**
 * Resolve every daily and prior-week reference in a weekly edition to a short
 * excerpt of the section it points at. Reads go through the same published
 * (anon) sources as the pages, so tombstoned editions simply have no preview.
 */
export async function loadWeeklyRefPreviews(
  content: WeeklyDigestContent,
): Promise<Record<string, WeeklyRefPreview>> {
  const dailyDates = new Set<string>()
  const priorWeeks = new Set<string>()
  for (const story of content.stories) {
    story.dailyStories.forEach((ref) => dailyDates.add(ref.digestDate))
    story.continuesFrom.forEach((ref) => priorWeeks.add(ref.weekStart))
  }
  content.alsoNotable.forEach((item) =>
    dailyDates.add(item.dailyStory.digestDate),
  )

  const previews: Record<string, WeeklyRefPreview> = {}
  await Promise.all([
    ...Array.from(dailyDates).map(async (date) => {
      const edition = await getPublishedDigest(date).catch(() => null)
      if (!edition || edition.isPreview) return
      for (const story of edition.content.stories) {
        previews[dailyPreviewKey(date, story.slug)] = {
          kicker: `Daily digest · ${previewDay(date)}`,
          title: story.title,
          excerpt: story.subtitle || story.bullets[0] || '',
        }
      }
    }),
    ...Array.from(priorWeeks).map(async (weekStart) => {
      const edition = await getPublishedWeeklyDigest(weekStart)
      if (!edition) return
      for (const story of edition.content.stories) {
        previews[weeklyPreviewKey(weekStart, story.slug)] = {
          kicker: `Week of ${previewDay(weekStart).replace(/^\w+ /, '')}`,
          title: story.title,
          excerpt: story.overview,
        }
      }
    }),
  ])
  return previews
}

// Profiles now load after the page has rendered and are cached for a day, so
// this only bounds a stuck lookup rather than the page.
const PROFILE_BUDGET_MS = 15_000

/**
 * Profile hover-card facts for the people a page mentions, resolved with the
 * page so the card opens complete. Slow or missing profiles are skipped; the
 * card then fetches them on hover as before.
 */
export async function loadWeeklyProfiles(
  content: WeeklyDigestContent,
  handles: Set<string>,
): Promise<ProfilePreview[]> {
  const people = weeklyPeople(content).filter((person) =>
    handles.has(person.username.toLowerCase()),
  )
  const timeout = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), PROFILE_BUDGET_MS),
  )
  const results = await Promise.all(
    people.map((person) =>
      Promise.race([
        resolveProfileCore(person.accountId ?? person.username)
          .then((resolved): ProfilePreview | null =>
            resolved
              ? {
                  accountId: resolved.accountId,
                  username: resolved.profile.username,
                  displayName: resolved.profile.account_display_name,
                  bio: resolved.profile.bio,
                  location: resolved.profile.location,
                  avatar: resolved.profile.avatar_media_url,
                  tweets: resolved.profile.num_tweets,
                  followers: resolved.profile.num_followers,
                  hasArchive: resolved.profile.has_archive,
                }
              : null,
          )
          .catch(() => null),
        timeout,
      ]),
    ),
  )
  return results.filter((item): item is ProfilePreview => item !== null)
}

/** Handles the week page shows: story overviews and the also-notable lines. */
export const weekPageHandles = (content: WeeklyDigestContent) =>
  handlesIn([
    ...content.stories.map((story) => story.subtitle),
    ...content.alsoNotable.map(({ line }) => line),
  ])

/**
 * Day and week previews for an edition, shared across requests: the linked
 * editions are already published, so an hour of staleness is harmless and
 * the page never waits on several edition reads.
 */
export const getCachedWeeklyRefPreviews = (weekStart: string) =>
  unstable_cache(
    async () => {
      const edition = await getPublishedWeeklyDigest(weekStart)
      return edition ? loadWeeklyRefPreviews(edition.content) : {}
    },
    ['weekly-ref-previews', weekStart],
    { revalidate: 3600 },
  )()

/**
 * Previews and profiles for a week-so-far edition. Keyed by edition id: each
 * morning's edition is a new row, so a cached entry never outlives its text.
 */
export const getCachedWeekSoFarRefPreviews = (edition: WeeklyDigestEdition) =>
  unstable_cache(
    () => loadWeeklyRefPreviews(edition.content),
    ['week-so-far-ref-previews', edition.id],
    { revalidate: 3600 },
  )()

export const getCachedWeekSoFarProfiles = (edition: WeeklyDigestEdition) =>
  unstable_cache(
    () => loadWeeklyProfiles(edition.content, weekPageHandles(edition.content)),
    ['week-so-far-profiles', edition.id],
    { revalidate: 86_400 },
  )()

/**
 * Hover-card profiles for the week page (no `storySlug`) or one story page,
 * cached for a day across requests.
 */
export const getCachedWeeklyProfiles = (weekStart: string, storySlug = '') =>
  unstable_cache(
    async (): Promise<ProfilePreview[]> => {
      const edition = await getPublishedWeeklyDigest(weekStart)
      if (!edition) return []
      const story = storySlug
        ? edition.content.stories.find((item) => item.slug === storySlug)
        : null
      if (storySlug && !story) return []
      const handles = story
        ? handlesIn([
            story.overview,
            story.continuityNote,
            ...story.segments.map(({ commentary }) => commentary),
          ])
        : weekPageHandles(edition.content)
      return loadWeeklyProfiles(edition.content, handles)
    },
    ['weekly-profiles', weekStart, storySlug],
    { revalidate: 86_400 },
  )()
