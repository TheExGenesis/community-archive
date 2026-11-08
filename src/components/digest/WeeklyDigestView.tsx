import Link from 'next/link'
import type { ReactNode } from 'react'
import TweetCard from '@/components/TweetCard'
import { DigestRefLink } from '@/components/digest/DigestRefLink'
import { DigestSubscribeButton } from '@/components/digest/DigestSubscribeButton'
import { WeeklyTrendChart } from '@/components/digest/WeeklyTrendChart'
import {
  WeeklyPeopleProvider,
  WeeklyText,
} from '@/components/digest/WeeklyText'
import { MUTED, SERIF } from '@/components/portal/styles'
import {
  dailyPreviewKey,
  weeklyPeople,
  weeklyPreviewKey,
  type WeeklyDigestContent,
  type WeeklyDigestStory,
  type WeeklyRefPreview,
} from '@/lib/digest/weekly'
import type { WeeklyDigestEdition } from '@/lib/digest/weeklyData'
import type { ProfilePreview } from '@/app/api/profile/[account_id]/preview/route'
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
const storyColor = (content: WeeklyDigestContent, slug: string) =>
  WEEKLY_MAP_COLORS[content.stories.findIndex((item) => item.slug === slug)] ??
  WEEKLY_MAP_COLORS[0]

const sectionLabel =
  'text-[11.5px] font-bold uppercase tracking-[0.22em] text-zinc-800 dark:text-zinc-200'
const chip =
  'rounded-full bg-zinc-100 px-2.5 py-1 font-semibold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100'
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

function KindChips({ story }: { story: WeeklyDigestStory }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
      <span className={chip}>
        {story.kind === 'ongoing'
          ? `Ongoing · ${story.days.length} days`
          : 'Major'}
      </span>
      {story.continuesFrom.length > 0 ? (
        <span className={chip}>Continuing story</span>
      ) : null}
      <span>
        {story.tweets.length} {story.tweets.length === 1 ? 'tweet' : 'tweets'}
      </span>
    </div>
  )
}

function WeekNav({ weekStart, weeks }: { weekStart: string; weeks: string[] }) {
  const index = weeks.indexOf(weekStart)
  const newer = index > 0 ? weeks[index - 1] : null
  const older = index >= 0 && index < weeks.length - 1 ? weeks[index + 1] : null
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
  profiles?: ProfilePreview[]
  children: ReactNode
}) {
  return (
    <WeeklyPeopleProvider people={weeklyPeople(content)} profiles={profiles}>
      <main className="min-h-screen bg-white dark:bg-[#111114]">
        <article className="mx-auto w-full max-w-[1180px] px-5 pb-24 pt-8 sm:px-8 sm:pt-12">
          {children}
        </article>
      </main>
    </WeeklyPeopleProvider>
  )
}

/** The week's front page: a subtitle, then straight into the stories. */
export function WeeklyDigestView({
  edition,
  weeks,
  previews = {},
  profiles,
}: {
  edition: WeeklyDigestEdition
  weeks: string[]
  previews?: Previews
  profiles?: ProfilePreview[]
}) {
  const content = edition.content
  const range = weekRangeLabel(content.weekStart, content.weekEnd)

  return (
    <Page content={content} profiles={profiles}>
      <div className="mx-auto max-w-[820px]">
        <header>
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-t border-zinc-800 pt-2.5 dark:border-zinc-200">
            <div className={sectionLabel}>The Week in Review</div>
            <WeekNav weekStart={edition.weekStart} weeks={weeks} />
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

        <div className="mt-2">
          <div className="min-w-0">
            <section aria-label="This week's stories">
              <ol>
                {content.stories.map((story, index) => (
                  <li
                    key={story.slug}
                    id={story.slug}
                    className="grid grid-cols-[2.25rem_1fr] gap-x-3 border-b border-zinc-200 py-6 last:border-b-0 dark:border-zinc-800 sm:grid-cols-[3rem_1fr]"
                  >
                    <span
                      aria-hidden
                      className="text-[30px] font-semibold leading-none sm:text-[38px]"
                      style={{ ...SERIF, color: WEEKLY_MAP_COLORS[index] }}
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <KindChips story={story} />
                      <h3
                        className="mt-3 text-[23px] font-semibold leading-[1.2] [text-wrap:pretty] sm:text-[27px]"
                        style={SERIF}
                      >
                        <Link
                          href={weeklyStoryPath(edition.weekStart, story.slug)}
                          className="rounded-sm hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        >
                          {plain(story.title)}
                        </Link>
                      </h3>
                      <p className="mt-2 leading-[1.6] text-zinc-700 [text-wrap:pretty] dark:text-zinc-300">
                        <WeeklyText>{story.overview}</WeeklyText>
                      </p>
                      <p className={`mt-3 text-[13px] leading-[1.7] ${MUTED}`}>
                        {story.dailyStories.map((ref, refIndex) => (
                          <span key={`${ref.digestDate}-${ref.slug}`}>
                            {refIndex > 0 ? ' · ' : ''}
                            <DailyRef
                              digestDate={ref.digestDate}
                              slug={ref.slug}
                              previews={previews}
                            >
                              {shortDay(ref.digestDate)}
                            </DailyRef>
                          </span>
                        ))}
                        {story.continuesFrom.length > 0 ? (
                          <>
                            {' — '}
                            <ContinuesFrom story={story} previews={previews} />
                          </>
                        ) : null}
                      </p>
                      <Link
                        href={weeklyStoryPath(edition.weekStart, story.slug)}
                        className={`mt-3 inline-block text-sm font-semibold ${navLink}`}
                      >
                        Read the story →
                      </Link>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            {content.alsoNotable.length > 0 ? (
              <section className="mt-6 border-t-2 border-zinc-800 pt-7 dark:border-zinc-200">
                <h2 className={sectionLabel}>Also this week</h2>
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
            <DigestSubscribeButton placement="digest" />
          </div>
        </div>
      </div>
    </Page>
  )
}

/** Story-page treatments of the commentary between tweets, under review. */
export const WEEKLY_STORY_LAYOUTS = ['flow', 'rail', 'grid', 'classic'] as const
export type WeeklyStoryLayout = (typeof WEEKLY_STORY_LAYOUTS)[number]
const LAYOUT_LABELS: Record<WeeklyStoryLayout, string> = {
  flow: 'Flow',
  rail: 'Rail',
  grid: 'Grid',
  classic: 'Classic',
}

const tweetFrame =
  'overflow-hidden rounded-2xl border border-zinc-200 bg-white px-4 [&_.border-t]:border-t-0 [&_.border-t]:py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_14px_-6px_rgba(0,0,0,0.08)] dark:border-zinc-800 dark:bg-zinc-900/70 dark:shadow-none'

function LayoutSwitcher({
  path,
  layout,
}: {
  path: string
  layout: WeeklyStoryLayout
}) {
  return (
    <nav
      aria-label="Preview layout"
      className={`mt-5 flex flex-wrap items-center gap-1.5 text-xs ${MUTED}`}
    >
      <span className="mr-1 uppercase tracking-[0.14em]">Layout preview</span>
      {WEEKLY_STORY_LAYOUTS.map((option) => (
        <Link
          key={option}
          href={option === 'flow' ? path : `${path}?layout=${option}`}
          aria-current={option === layout ? 'page' : undefined}
          className={`rounded-full px-2.5 py-1 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
            option === layout
              ? 'bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900'
              : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200'
          }`}
        >
          {LAYOUT_LABELS[option]}
        </Link>
      ))}
    </nav>
  )
}

/** One weekly story on its own page. */
export function WeeklyStoryView({
  edition,
  story,
  previews = {},
  profiles,
  layout = 'flow',
}: {
  edition: WeeklyDigestEdition
  story: WeeklyDigestStory
  previews?: Previews
  profiles?: ProfilePreview[]
  layout?: WeeklyStoryLayout
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
  const carded = layout !== 'classic'

  const tweetCard = (id: string) => {
    const tweet = byId.get(id)
    if (!tweet) return null
    const card = (
      <TweetCard
        tweet={tweet}
        variant="editorial"
        collapsible
        showDate
        origin="digest"
        returnTo={returnTo}
      />
    )
    return carded ? (
      <div key={id} className={tweetFrame}>
        {card}
      </div>
    ) : (
      <div key={id}>{card}</div>
    )
  }

  const prose =
    'text-[17.5px] leading-[1.65] text-zinc-800 [text-wrap:pretty] dark:text-zinc-200'
  const segments =
    layout === 'rail' ? (
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
    ) : layout === 'grid' ? (
      <div className="mt-9 space-y-10">
        {story.segments.map((segment, segmentIndex) => (
          <section key={segmentIndex}>
            <p className={prose}>
              <WeeklyText>{segment.commentary}</WeeklyText>
            </p>
            <div
              className={`mt-4 grid items-start gap-4 ${segment.tweetIds.length > 1 ? 'sm:grid-cols-2' : ''}`}
            >
              {segment.tweetIds.map(tweetCard)}
            </div>
          </section>
        ))}
      </div>
    ) : layout === 'classic' ? (
      <div className="mt-8 space-y-9">
        {story.segments.map((segment, segmentIndex) => (
          <section key={segmentIndex} className="space-y-4">
            <p
              className="border-l-[3px] pl-4 text-[17px] leading-[1.6] text-zinc-800 [text-wrap:pretty] dark:text-zinc-200"
              style={{ borderColor: color }}
            >
              <WeeklyText>{segment.commentary}</WeeklyText>
            </p>
            <div className="space-y-4">{segment.tweetIds.map(tweetCard)}</div>
          </section>
        ))}
      </div>
    ) : (
      <div className="mt-9 space-y-9">
        {story.segments.map((segment, segmentIndex) => (
          <section key={segmentIndex}>
            <p className={prose}>
              <WeeklyText>{segment.commentary}</WeeklyText>
            </p>
            <div className="mt-4 space-y-3 sm:pl-6">
              {segment.tweetIds.map(tweetCard)}
            </div>
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
        <div
          className={`min-w-0 ${layout === 'rail' || layout === 'grid' ? 'max-w-[860px]' : 'max-w-[760px]'}`}
        >
          <header>
            <KindChips story={story} />
            <h1
              className="mt-4 text-[32px] font-semibold leading-[1.12] tracking-[-0.005em] [text-wrap:pretty] sm:text-[42px]"
              style={SERIF}
            >
              {plain(story.title)}
            </h1>
            <p className="mt-5 text-lg leading-[1.6] text-zinc-800 [text-wrap:pretty] dark:text-zinc-200 sm:text-[19px]">
              <WeeklyText>{story.overview}</WeeklyText>
            </p>
            {story.connection ? (
              <p className={`mt-5 text-[15px] leading-[1.6] ${MUTED}`}>
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                  How these connect.{' '}
                </span>
                <WeeklyText>{story.connection}</WeeklyText>
              </p>
            ) : null}
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

          <LayoutSwitcher path={returnTo} layout={layout} />
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
