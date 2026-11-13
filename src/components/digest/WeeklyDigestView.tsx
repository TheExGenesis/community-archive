import Link from 'next/link'
import type { ReactNode } from 'react'
import TweetCard from '@/components/TweetCard'
import { DigestRefLink } from '@/components/digest/DigestRefLink'
import { DigestSubscribeButton } from '@/components/digest/DigestSubscribeButton'
import {
  TweetCardGrid,
  tweetCardFrame,
} from '@/components/digest/TweetCardGrid'
import { WeeklyTrendChart } from '@/components/digest/WeeklyTrendChart'
import {
  WeeklyPeopleProvider,
  WeeklyText,
} from '@/components/digest/WeeklyText'
import { MUTED, SERIF } from '@/components/portal/styles'
import { buildSearchHref } from '@/lib/searchParams'
import {
  dailyPreviewKey,
  weeklyPeople,
  weeklyPreviewKey,
  type WeeklyDigestContent,
  type WeeklyDigestStory,
  type WeeklyRefPreview,
} from '@/lib/digest/weekly'
import type { WeeklyDigestEdition } from '@/lib/digest/weeklyData'
import { WEEKLY_MAP_COLORS } from '@/lib/digest/weeklyMap'

type Previews = Record<string, WeeklyRefPreview>

const dayLabel = (date: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' }).format(
    new Date(`${date}T12:00:00Z`),
  )

const shortDay = (date: string) =>
  dayLabel(date, { weekday: 'short', day: 'numeric', month: 'short' })

export const weekRangeLabel = (start: string, end: string) =>
  `${dayLabel(start, { day: 'numeric', month: 'long' })} – ${dayLabel(end, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })}`

export const weeklyStoryPath = (weekStart: string, slug: string) =>
  `/digest/week/${weekStart}/${slug}`

const plain = (markdown: string) => markdown.replace(/[*_`]/g, '')
/** Quote titles get curly marks, like daily story titles. */
const displayTitle = (story: WeeklyDigestStory) =>
  story.titleIsQuote ? `\u201c${plain(story.title)}\u201d` : plain(story.title)
const storyColor = (content: WeeklyDigestContent, slug: string) =>
  WEEKLY_MAP_COLORS[content.stories.findIndex((item) => item.slug === slug)] ??
  WEEKLY_MAP_COLORS[0]

const sectionLabel =
  'text-[11.5px] font-bold uppercase tracking-[0.22em] text-zinc-800 dark:text-zinc-200'
const refLink =
  'rounded-sm text-brand underline decoration-dotted decoration-brand/50 underline-offset-[3px] hover:decoration-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand'
const navLink =
  'rounded-sm text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand'

function PreviewCard({ preview }: { preview?: WeeklyRefPreview }) {
  if (!preview) return null
  return (
    <div className="space-y-1.5">
      <div className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        {preview.kicker}
      </div>
      <div className="font-semibold leading-snug" style={SERIF}>
        {plain(preview.title)}
      </div>
      {preview.excerpt ? (
        <p className="line-clamp-4 text-[13px] leading-[1.5] text-muted-foreground">
          {plain(preview.excerpt)}
        </p>
      ) : null}
    </div>
  )
}

function DailyRef({
  digestDate,
  slug,
  previews,
  children,
  className = refLink,
}: {
  digestDate: string
  slug: string
  previews: Previews
  children: ReactNode
  className?: string
}) {
  const preview = previews[dailyPreviewKey(digestDate, slug)]
  return (
    <DigestRefLink
      href={`/digest/${digestDate}/${slug}`}
      className={className}
      preview={preview ? <PreviewCard preview={preview} /> : undefined}
    >
      {children}
    </DigestRefLink>
  )
}

function ContinuesFrom({
  story,
  previews,
}: {
  story: WeeklyDigestStory
  previews: Previews
}) {
  if (story.continuesFrom.length === 0) return null
  return (
    <>
      Continues from{' '}
      {story.continuesFrom.map((ref, index) => {
        const preview = previews[weeklyPreviewKey(ref.weekStart, ref.slug)]
        return (
          <span key={`${ref.weekStart}-${ref.slug}`}>
            {index > 0 ? '; ' : ''}
            <DigestRefLink
              href={weeklyStoryPath(ref.weekStart, ref.slug)}
              className={refLink}
              preview={preview ? <PreviewCard preview={preview} /> : undefined}
            >
              the week of{' '}
              {dayLabel(ref.weekStart, { day: 'numeric', month: 'long' })}
            </DigestRefLink>
          </span>
        )
      })}
    </>
  )
}

function WeekNav({
  weekStart,
  weeks,
  weekSoFar = false,
}: {
  weekStart: string
  weeks: string[]
  /** Link the newest final week to the running week's page. */
  weekSoFar?: boolean
}) {
  const index = weeks.indexOf(weekStart)
  const newer = index > 0 ? weeks[index - 1] : null
  // A running week is newer than every final week in `weeks`.
  const older =
    index < 0
      ? (weeks.find((week) => week < weekStart) ?? null)
      : index < weeks.length - 1
        ? weeks[index + 1]
        : null
  return (
    <nav
      aria-label="Other weeks"
      className={`flex flex-wrap gap-x-4 gap-y-1 whitespace-nowrap text-[11.5px] uppercase tracking-[0.18em] ${MUTED}`}
    >
      {older ? (
        <Link href={`/digest/week/${older}`} className={navLink}>
          ← Previous week
        </Link>
      ) : null}
      {newer ? (
        <Link href={`/digest/week/${newer}`} className={navLink}>
          Next week →
        </Link>
      ) : index === 0 && weekSoFar ? (
        <Link href="/digest/week" className={navLink}>
          This week so far →
        </Link>
      ) : null}
      <Link href="/digest" className={navLink}>
        Daily digest
      </Link>
    </nav>
  )
}

function SidebarSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="border-t-2 border-zinc-800 pt-3 dark:border-zinc-200">
      <h2 className={sectionLabel}>{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function TrendCharts({
  content,
  terms,
  color,
  note,
}: {
  content: WeeklyDigestContent
  terms: string[]
  color?: (term: string) => string
  note?: string
}) {
  const trends = content.trends
  const series = trends
    ? terms.flatMap((term) => {
        const found = trends.series.find((item) => item.term === term)
        return found ? [found] : []
      })
    : []
  if (!trends || series.length === 0) return null
  return (
    <SidebarSection title="Trending words">
      <div className="space-y-5">
        {series.map((item) => (
          <WeeklyTrendChart
            key={item.term}
            days={trends.days}
            series={item}
            weekStart={content.weekStart}
            color={color?.(item.term)}
          />
        ))}
      </div>
      <p className={`mt-4 text-[11.5px] leading-[1.5] ${MUTED}`}>
        {note ??
          'Daily mentions per 100k archived tweets. The percentage compares this week with the week before.'}{' '}
        <Link href="/trends" className={navLink}>
          Explore trends →
        </Link>
      </p>
    </SidebarSection>
  )
}

function Page({
  content,
  profiles,
  children,
}: {
  content: WeeklyDigestContent
  /** Streams profile hover-card facts in after the page. */
  profiles?: ReactNode
  children: ReactNode
}) {
  return (
    <WeeklyPeopleProvider people={weeklyPeople(content)}>
      {profiles}
      <main className="min-h-screen bg-white dark:bg-[#111114]">
        <article className="mx-auto w-full max-w-[1180px] px-5 pb-24 pt-8 sm:px-8 sm:pt-12">
          {children}
        </article>
      </main>
    </WeeklyPeopleProvider>
  )
}

const sidebarHeading = 'text-[19px] font-semibold'
const keywordChip =
  'rounded-full bg-zinc-100 px-3 py-1.5 text-xs transition-colors hover:bg-blue-100 hover:text-blue-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:bg-zinc-800 dark:hover:bg-blue-950 dark:hover:text-blue-100'

/** Week-page terms with the most mentions this week, at most `limit`. */
function topTrendTerms(content: WeeklyDigestContent, limit: number) {
  const trends = content.trends
  if (!trends) return []
  const thisWeek = (tweets: number[]) =>
    trends.days.reduce(
      (sum, day, index) =>
        day >= content.weekStart && day <= content.weekEnd
          ? sum + (tweets[index] ?? 0)
          : sum,
      0,
    )
  const storyTerms = new Set(content.stories.flatMap((s) => s.trendTerms))
  return trends.series
    .filter((series) => storyTerms.has(series.term))
    .sort((a, b) => thisWeek(b.tweets) - thisWeek(a.tweets))
    .slice(0, limit)
    .map((series) => series.term)
}

/** Daily-style sidebar: earlier weeks this one continues, trends, keywords. */
function WeekSidebar({
  content,
  previews,
}: {
  content: WeeklyDigestContent
  previews: Previews
}) {
  const continued = content.stories.flatMap((story) =>
    story.continuesFrom.map((ref) => ({ ref, story })),
  )
  const keywords = Array.from(
    new Set([
      ...content.stories.flatMap((story) => story.trendTerms),
      ...(content.trends?.weekTerms ?? []),
    ]),
  ).slice(0, 14)
  const trendTerms = topTrendTerms(content, 3)

  return (
    <aside className="border-zinc-200 pt-2 dark:border-zinc-800 lg:sticky lg:top-24 lg:mt-9 lg:border-l lg:pl-10">
      {continued.length > 0 ? (
        <section>
          <h2 className={sidebarHeading} style={SERIF}>
            Continued from earlier weeks
          </h2>
          <ul className="mt-4 space-y-3">
            {continued.map(({ ref, story }) => {
              const preview =
                previews[weeklyPreviewKey(ref.weekStart, ref.slug)]
              return (
                <li key={`${ref.weekStart}-${ref.slug}-${story.slug}`}>
                  <Link
                    href={weeklyStoryPath(ref.weekStart, ref.slug)}
                    className="block rounded-xl border border-zinc-200 p-3.5 transition-colors hover:border-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:border-zinc-800 dark:hover:border-zinc-600"
                  >
                    <div
                      className={`text-[11px] uppercase tracking-[0.14em] ${MUTED}`}
                    >
                      Week of{' '}
                      {dayLabel(ref.weekStart, {
                        day: 'numeric',
                        month: 'long',
                      })}
                    </div>
                    <div
                      className="mt-1 font-semibold leading-snug"
                      style={SERIF}
                    >
                      {plain(preview?.title ?? ref.title)}
                    </div>
                    {preview?.excerpt ? (
                      <p
                        className={`mt-1.5 line-clamp-3 text-[13px] leading-[1.5] ${MUTED}`}
                      >
                        {plain(preview.excerpt)}
                      </p>
                    ) : null}
                    <div className="mt-2 text-[12.5px] text-brand">
                      Continues in “{plain(story.title)}”
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      {trendTerms.length > 0 ? (
        <div className={continued.length > 0 ? 'mt-8' : undefined}>
          <TrendCharts
            content={content}
            terms={trendTerms}
            note="Daily mentions per 100k archived tweets of the week's most-used story words. The percentage compares this week with the week before."
          />
        </div>
      ) : null}

      {keywords.length > 0 ? (
        <section className="mt-8 border-t border-zinc-200 pt-7 dark:border-zinc-800">
          <h2 className={sidebarHeading} style={SERIF}>
            Keywords this week
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {keywords.map((keyword) => (
              <Link
                key={keyword}
                href={buildSearchHref(keyword)}
                aria-label={`Search Community Archive for ${keyword}`}
                className={keywordChip}
              >
                {keyword}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </aside>
  )
}

/** The tweets shown with a story on the week page. */
const featuredTweets = (story: WeeklyDigestStory) => {
  const byId = new Map(story.tweets.map((tweet) => [tweet.id, tweet]))
  const chosen = story.featuredTweetIds.flatMap((id) => {
    const tweet = byId.get(id)
    return tweet ? [tweet] : []
  })
  return chosen.length > 0 ? chosen : story.tweets.slice(0, 2)
}

/** The week's front page: a subtitle, then straight into the stories. */
/** The daily stories a week-so-far story is built from, oldest first. */
function DailyStoryLinks({
  story,
  previews,
}: {
  story: WeeklyDigestStory
  previews: Previews
}) {
  if (story.dailyStories.length === 0) return null
  const refs = [...story.dailyStories].sort((a, b) =>
    a.digestDate.localeCompare(b.digestDate),
  )
  return (
    <div className="mt-5 text-sm">
      <div className={`font-semibold ${MUTED}`}>In the daily digest</div>
      <ul className="mt-1.5 space-y-1">
        {refs.map((ref) => (
          <li key={`${ref.digestDate}-${ref.slug}`} className="leading-[1.5]">
            <span className={`mr-2 tabular-nums ${MUTED}`}>
              {shortDay(ref.digestDate)}
            </span>
            <DailyRef
              digestDate={ref.digestDate}
              slug={ref.slug}
              previews={previews}
              className={`font-semibold ${navLink}`}
            >
              {plain(ref.title)} →
            </DailyRef>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Points the week-so-far reader at last week's final edition. */
function LastWeek({ edition }: { edition: WeeklyDigestEdition }) {
  const { content } = edition
  return (
    <section className="mt-10 border-t-2 border-zinc-800 pt-7 dark:border-zinc-200">
      <h2 className={sectionLabel}>Last week in review</h2>
      <Link
        href={`/digest/week/${edition.weekStart}`}
        className="group mt-4 block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <span
          className="block text-[24px] font-semibold leading-[1.15] group-hover:text-brand sm:text-[28px]"
          style={SERIF}
        >
          {weekRangeLabel(content.weekStart, content.weekEnd)}
        </span>
        {content.dek ? (
          <span
            className="mt-2 block max-w-[60ch] text-[17px] italic leading-[1.45] text-zinc-700 dark:text-zinc-300"
            style={SERIF}
          >
            {content.dek}
          </span>
        ) : null}
        <span className={`mt-3 inline-block text-sm font-semibold ${navLink}`}>
          Read last week&apos;s Week in Review →
        </span>
      </Link>
    </section>
  )
}

export function WeeklyDigestView({
  edition,
  weeks,
  previews = {},
  profiles,
  bulletin,
  comments,
  soFar,
  weekSoFarLink = false,
}: {
  edition: WeeklyDigestEdition
  weeks: string[]
  previews?: Previews
  /**
   * Set for the running week's provisional edition: no story pages, links to
   * the daily stories instead, and a pointer to last week's final edition.
   */
  soFar?: { lastWeek: WeeklyDigestEdition | null }
  /** Show "This week so far" in the newest final week's navigation. */
  weekSoFarLink?: boolean
  /** Streams profile hover-card facts in after the page. */
  profiles?: ReactNode
  /** Recommended Bulletin asks and offers, rendered under the stories. */
  bulletin?: ReactNode
  /** The edition's discussion thread. */
  comments?: ReactNode
}) {
  const content = edition.content
  const range = weekRangeLabel(content.weekStart, content.weekEnd)

  return (
    <Page content={content} profiles={profiles}>
      <div>
        <header className="max-w-[880px]">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-t border-zinc-800 pt-2.5 dark:border-zinc-200">
            <div className={sectionLabel}>
              {soFar ? 'The Week So Far' : 'The Week in Review'}
            </div>
            <WeekNav
              weekStart={edition.weekStart}
              weeks={weeks}
              weekSoFar={weekSoFarLink}
            />
          </div>
          <h1
            className="mt-5 text-[38px] font-semibold leading-[1.05] tracking-[-0.01em] sm:text-[52px]"
            style={SERIF}
          >
            {range}
          </h1>
          {content.dek ? (
            <p
              className="mt-4 max-w-[46ch] text-[21px] italic leading-[1.4] text-zinc-700 [text-wrap:pretty] dark:text-zinc-300 sm:text-[24px]"
              style={SERIF}
            >
              {content.dek}
            </p>
          ) : null}
          <p className={`mt-4 text-sm ${MUTED}`}>
            {soFar && content.throughDate
              ? `Through ${dayLabel(content.throughDate, { weekday: 'long', day: 'numeric', month: 'long' })}, updated each morning. `
              : ''}
            Woven from {content.source.editionDates.length} daily{' '}
            {content.source.editionDates.length === 1 ? 'edition' : 'editions'}
            {content.source.missingDates.length > 0
              ? ` (no edition on ${content.source.missingDates
                  .map((date) => dayLabel(date, { weekday: 'long' }))
                  .join(', ')})`
              : ''}
            .
          </p>
        </header>
        <div className="mt-7 border-t-[3px] border-zinc-800 dark:border-zinc-200" />
        <div className="mt-[3px] border-t border-zinc-400 dark:border-zinc-600" />

        <div className="mt-2 grid items-start gap-y-10 lg:grid-cols-[minmax(0,1fr)_316px] lg:gap-x-14">
          <div className="min-w-0">
            <section aria-label="This week's stories">
              <ol>
                {content.stories.map((story, index) => (
                  <li
                    key={story.slug}
                    id={story.slug}
                    className="grid grid-cols-[2.25rem_1fr] gap-x-3 border-b border-zinc-200 py-9 last:border-b-0 dark:border-zinc-800 sm:grid-cols-[3rem_1fr]"
                  >
                    <span
                      aria-hidden
                      className="text-[30px] font-semibold leading-none text-zinc-400 dark:text-zinc-500 sm:text-[38px]"
                      style={SERIF}
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <h3
                        className="text-[28px] font-semibold leading-[1.14] tracking-[-0.005em] [text-wrap:pretty] sm:text-[36px]"
                        style={SERIF}
                      >
                        {soFar ? (
                          displayTitle(story)
                        ) : (
                          <Link
                            href={weeklyStoryPath(
                              edition.weekStart,
                              story.slug,
                            )}
                            className="rounded-sm hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                          >
                            {displayTitle(story)}
                          </Link>
                        )}
                      </h3>
                      <p
                        className={`mt-3 max-w-[62ch] text-base leading-[1.65] [text-wrap:pretty] sm:text-[17.5px] ${MUTED}`}
                      >
                        <WeeklyText>{story.subtitle}</WeeklyText>
                        {story.continuesFrom.length > 0 ? (
                          <span className="mt-1.5 block text-[13px] leading-[1.6]">
                            <ContinuesFrom story={story} previews={previews} />
                          </span>
                        ) : null}
                      </p>
                      <div className="mt-6">
                        <TweetCardGrid
                          tweets={featuredTweets(story)}
                          returnTo={
                            soFar
                              ? '/digest/week'
                              : `/digest/week/${edition.weekStart}`
                          }
                        />
                      </div>
                      {soFar ? (
                        <DailyStoryLinks story={story} previews={previews} />
                      ) : (
                        <Link
                          href={weeklyStoryPath(edition.weekStart, story.slug)}
                          className={`mt-5 inline-block text-sm font-semibold ${navLink}`}
                        >
                          Read the story →
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            {content.alsoNotable.length > 0 ? (
              <section className="mt-6 border-t-2 border-zinc-800 pt-7 dark:border-zinc-200">
                <h2 className={sectionLabel}>
                  {soFar ? 'Also so far' : 'Also this week'}
                </h2>
                <ul className="mt-5 space-y-3 leading-[1.6]">
                  {content.alsoNotable.map((item) => (
                    <li
                      key={`${item.dailyStory.digestDate}-${item.dailyStory.slug}`}
                    >
                      <WeeklyText>{item.line}</WeeklyText>{' '}
                      <DailyRef
                        digestDate={item.dailyStory.digestDate}
                        slug={item.dailyStory.slug}
                        previews={previews}
                        className={`text-[13px] ${refLink}`}
                      >
                        {shortDay(item.dailyStory.digestDate)} →
                      </DailyRef>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {soFar?.lastWeek ? <LastWeek edition={soFar.lastWeek} /> : null}
            <DigestSubscribeButton placement="digest" list="weekly" />
          </div>

          <WeekSidebar content={content} previews={previews} />
        </div>

        {bulletin}
        {comments}
      </div>
    </Page>
  )
}

/** One weekly story on its own page. */
export function WeeklyStoryView({
  edition,
  story,
  previews = {},
  profiles,
}: {
  edition: WeeklyDigestEdition
  story: WeeklyDigestStory
  previews?: Previews
  /** Streams profile hover-card facts in after the page. */
  profiles?: ReactNode
}) {
  const content = edition.content
  const stories = content.stories
  const index = stories.findIndex((item) => item.slug === story.slug)
  const previous = index > 0 ? stories[index - 1] : null
  const next = index < stories.length - 1 ? stories[index + 1] : null
  const returnTo = weeklyStoryPath(edition.weekStart, story.slug)
  const color = storyColor(content, story.slug)
  const byId = new Map(story.tweets.map((tweet) => [tweet.id, tweet]))
  const placed = new Set(story.segments.flatMap(({ tweetIds }) => tweetIds))
  const rest = story.tweets.filter(({ id }) => !placed.has(id))

  const tweetCard = (id: string) => {
    const tweet = byId.get(id)
    if (!tweet) return null
    return (
      <div key={id} className={tweetCardFrame}>
        <TweetCard
          tweet={tweet}
          variant="editorial"
          collapsible
          showDate
          origin="digest"
          returnTo={returnTo}
        />
      </div>
    )
  }

  // Commentary on a numbered rail that stays in view beside its tweets.
  const segments = (
    <div className="mt-10 space-y-10">
      {story.segments.map((segment, segmentIndex) => (
        <section
          key={segmentIndex}
          className="grid gap-4 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:gap-7"
        >
          <div className="md:sticky md:top-24 md:self-start">
            <div
              className="text-[13px] font-bold tabular-nums"
              style={{ color }}
            >
              {String(segmentIndex + 1).padStart(2, '0')}
            </div>
            <p className="mt-1.5 text-[15px] leading-[1.6] text-zinc-800 [text-wrap:pretty] dark:text-zinc-200">
              <WeeklyText>{segment.commentary}</WeeklyText>
            </p>
          </div>
          <div className="space-y-4">{segment.tweetIds.map(tweetCard)}</div>
        </section>
      ))}
    </div>
  )

  return (
    <Page content={content} profiles={profiles}>
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-t border-zinc-800 pt-3 dark:border-zinc-200">
        <Link
          href={`/digest/week/${edition.weekStart}`}
          className="rounded-sm text-sm font-semibold text-muted-foreground hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          ← The Week in Review,{' '}
          {weekRangeLabel(content.weekStart, content.weekEnd)}
        </Link>
        <span className={`text-xs ${MUTED}`}>
          Story {index + 1} of {stories.length}
        </span>
      </div>

      <div className="mt-9 grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 max-w-[860px]">
          <header>
            <h1
              className="text-[32px] font-semibold leading-[1.12] tracking-[-0.005em] [text-wrap:pretty] sm:text-[42px]"
              style={SERIF}
            >
              {displayTitle(story)}
            </h1>
            <p className="mt-5 text-lg leading-[1.6] text-zinc-800 [text-wrap:pretty] dark:text-zinc-200 sm:text-[19px]">
              <WeeklyText>{story.overview}</WeeklyText>
            </p>
            {story.continuesFrom.length > 0 ? (
              <p className={`mt-3 text-[15px] leading-[1.6] ${MUTED}`}>
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                  <ContinuesFrom story={story} previews={previews} />.{' '}
                </span>
                {story.continuityNote ? (
                  <WeeklyText>{story.continuityNote}</WeeklyText>
                ) : null}
              </p>
            ) : null}
          </header>

          {segments}

          {rest.length > 0 ? (
            <section className="mt-12 border-t-2 border-zinc-800 pt-5 dark:border-zinc-200">
              <h2 className={sectionLabel}>More from the daily coverage</h2>
              <div className="mt-5 space-y-4">
                {rest.map(({ id }) => tweetCard(id))}
              </div>
            </section>
          ) : null}

          <nav
            aria-label="Other stories this week"
            className="mt-12 grid gap-4 border-t border-zinc-300 pt-5 dark:border-zinc-700 sm:grid-cols-2"
          >
            {previous ? (
              <Link
                href={weeklyStoryPath(edition.weekStart, previous.slug)}
                className="group rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <div className={`text-xs uppercase tracking-[0.16em] ${MUTED}`}>
                  ← Previous story
                </div>
                <div
                  className="mt-1 font-semibold leading-snug group-hover:text-brand"
                  style={SERIF}
                >
                  {plain(previous.title)}
                </div>
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link
                href={weeklyStoryPath(edition.weekStart, next.slug)}
                className="group rounded-sm text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <div className={`text-xs uppercase tracking-[0.16em] ${MUTED}`}>
                  Next story →
                </div>
                <div
                  className="mt-1 font-semibold leading-snug group-hover:text-brand"
                  style={SERIF}
                >
                  {plain(next.title)}
                </div>
              </Link>
            ) : null}
          </nav>
        </div>

        <aside className="space-y-10 lg:sticky lg:top-20 lg:self-start">
          <SidebarSection title="Daily coverage">
            <ul className="space-y-3">
              {story.dailyStories.map((ref) => (
                <li
                  key={`${ref.digestDate}-${ref.slug}`}
                  className="text-[14px] leading-[1.45]"
                >
                  <div
                    className={`text-[11.5px] uppercase tracking-[0.12em] ${MUTED}`}
                  >
                    {shortDay(ref.digestDate)}
                  </div>
                  <DailyRef
                    digestDate={ref.digestDate}
                    slug={ref.slug}
                    previews={previews}
                  >
                    {plain(ref.title)}
                  </DailyRef>
                </li>
              ))}
            </ul>
          </SidebarSection>
          <TrendCharts
            content={content}
            terms={story.trendTerms}
            color={() => color}
          />
        </aside>
      </div>
    </Page>
  )
}
