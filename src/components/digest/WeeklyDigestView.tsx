import Link from 'next/link'
import TweetCard from '@/components/TweetCard'
import { DigestMarkdown } from '@/components/digest/DigestMarkdown'
import { DigestRefLink } from '@/components/digest/DigestRefLink'
import { DigestSubscribeButton } from '@/components/digest/DigestSubscribeButton'
import { MUTED, SERIF } from '@/components/portal/styles'
import {
  dailyPreviewKey,
  weeklyPreviewKey,
  type WeeklyDigestStory,
  type WeeklyRefPreview,
} from '@/lib/digest/weekly'
import type { WeeklyDigestEdition } from '@/lib/digest/weeklyData'

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
        <DigestMarkdown allowLinks={false}>{preview.title}</DigestMarkdown>
      </div>
      {preview.excerpt ? (
        <p className="line-clamp-4 text-[13px] leading-[1.5] text-muted-foreground">
          <DigestMarkdown allowLinks={false}>{preview.excerpt}</DigestMarkdown>
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
  children: React.ReactNode
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

/** The week's front page: summary, then a table of contents of its stories. */
export function WeeklyDigestView({
  edition,
  weeks,
  previews = {},
}: {
  edition: WeeklyDigestEdition
  weeks: string[]
  previews?: Previews
}) {
  const content = edition.content

  return (
    <main className="min-h-screen bg-white dark:bg-[#111114]">
      <article className="mx-auto w-full max-w-[880px] px-5 pb-24 pt-8 sm:px-8 sm:pt-12">
        <header>
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-t border-zinc-800 pt-2.5 dark:border-zinc-200">
            <div className={sectionLabel}>The Week in Review</div>
            <WeekNav weekStart={edition.weekStart} weeks={weeks} />
          </div>
          <h1
            className="mt-5 text-[38px] font-semibold leading-[1.05] tracking-[-0.01em] sm:text-[52px]"
            style={SERIF}
          >
            {weekRangeLabel(content.weekStart, content.weekEnd)}
          </h1>
          <p className={`mt-3 text-sm ${MUTED}`}>
            Woven from {content.source.editionDates.length} daily{' '}
            {content.source.editionDates.length === 1 ? 'edition' : 'editions'}
            {content.source.missingDates.length > 0
              ? ` (no edition on ${content.source.missingDates
                  .map((date) => dayLabel(date, { weekday: 'long' }))
                  .join(', ')})`
              : ''}
            .
          </p>
          <div className="mt-7 border-t-[3px] border-zinc-800 dark:border-zinc-200" />
          <div className="mt-[3px] border-t border-zinc-400 dark:border-zinc-600" />
          <ul
            className="mt-7 max-w-[70ch] list-disc space-y-2.5 pl-6 text-lg italic leading-[1.55] text-zinc-700 marker:text-zinc-400 dark:text-zinc-300 dark:marker:text-zinc-600 sm:text-[20px]"
            style={SERIF}
          >
            {content.executiveSummary.map((bullet) => (
              <li key={bullet} className="pl-1 [text-wrap:pretty]">
                <DigestMarkdown>{bullet}</DigestMarkdown>
              </li>
            ))}
          </ul>
          <DigestSubscribeButton placement="digest" />
        </header>

        <section aria-labelledby="weekly-contents" className="mt-12">
          <h2
            id="weekly-contents"
            className={`${sectionLabel} border-t-2 border-zinc-800 pt-3 dark:border-zinc-200`}
          >
            In this issue
          </h2>
          <ol className="mt-2">
            {content.stories.map((story, index) => (
              <li
                key={story.slug}
                id={story.slug}
                className="grid grid-cols-[2.25rem_1fr] gap-x-3 border-b border-zinc-200 py-6 last:border-b-0 dark:border-zinc-800 sm:grid-cols-[3rem_1fr]"
              >
                <span
                  aria-hidden
                  className="text-[30px] font-semibold leading-none text-zinc-300 dark:text-zinc-600 sm:text-[38px]"
                  style={SERIF}
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
                      <DigestMarkdown allowLinks={false}>
                        {story.title}
                      </DigestMarkdown>
                    </Link>
                  </h3>
                  <p className="mt-2 leading-[1.55] text-zinc-700 [text-wrap:pretty] dark:text-zinc-300">
                    <DigestMarkdown>{story.subtitle}</DigestMarkdown>
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
                  <DigestMarkdown>{item.line}</DigestMarkdown>{' '}
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
      </article>
    </main>
  )
}

/** One weekly story on its own page. */
export function WeeklyStoryView({
  edition,
  story,
  previews = {},
}: {
  edition: WeeklyDigestEdition
  story: WeeklyDigestStory
  previews?: Previews
}) {
  const content = edition.content
  const stories = content.stories
  const index = stories.findIndex((item) => item.slug === story.slug)
  const previous = index > 0 ? stories[index - 1] : null
  const next = index < stories.length - 1 ? stories[index + 1] : null
  const returnTo = weeklyStoryPath(edition.weekStart, story.slug)

  return (
    <main className="min-h-screen bg-white dark:bg-[#111114]">
      <article className="mx-auto w-full max-w-[880px] px-5 pb-24 pt-8 sm:px-8 sm:pt-12">
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

        <header className="mt-9">
          <KindChips story={story} />
          <h1
            className="mt-4 text-[32px] font-semibold leading-[1.12] tracking-[-0.005em] [text-wrap:pretty] sm:text-[42px]"
            style={SERIF}
          >
            <DigestMarkdown allowLinks={false}>{story.title}</DigestMarkdown>
          </h1>
          <p className="mt-4 text-lg leading-[1.55] text-zinc-700 [text-wrap:pretty] dark:text-zinc-300 sm:text-xl">
            <DigestMarkdown>{story.subtitle}</DigestMarkdown>
          </p>
        </header>

        <ul className="mt-7 list-disc space-y-2.5 pl-6 text-[17px] leading-[1.6] marker:text-zinc-400">
          {story.bullets.map((bullet) => (
            <li key={bullet}>
              <DigestMarkdown>{bullet}</DigestMarkdown>
            </li>
          ))}
        </ul>

        {story.connection ? (
          <p className={`mt-6 text-[15px] leading-[1.6] ${MUTED}`}>
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">
              How these connect.{' '}
            </span>
            <DigestMarkdown>{story.connection}</DigestMarkdown>
          </p>
        ) : null}
        {story.continuesFrom.length > 0 ? (
          <p className={`mt-3 text-[15px] leading-[1.6] ${MUTED}`}>
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">
              <ContinuesFrom story={story} previews={previews} />.{' '}
            </span>
            {story.continuityNote ? (
              <DigestMarkdown>{story.continuityNote}</DigestMarkdown>
            ) : null}
          </p>
        ) : null}

        <section className="mt-10 border-t-2 border-zinc-800 pt-5 dark:border-zinc-200">
          <h2 className={sectionLabel}>Daily coverage</h2>
          <ul className="mt-4 space-y-3">
            {story.dailyStories.map((ref) => (
              <li
                key={`${ref.digestDate}-${ref.slug}`}
                className="grid grid-cols-[6.5rem_1fr] gap-3 leading-[1.5]"
              >
                <span className={`text-[13px] ${MUTED}`}>
                  {shortDay(ref.digestDate)}
                </span>
                <DailyRef
                  digestDate={ref.digestDate}
                  slug={ref.slug}
                  previews={previews}
                >
                  <DigestMarkdown allowLinks={false}>
                    {ref.title}
                  </DigestMarkdown>
                </DailyRef>
              </li>
            ))}
          </ul>
        </section>

        {story.tweets.length > 0 ? (
          <section className="mt-10 border-t-2 border-zinc-800 pt-5 dark:border-zinc-200">
            <h2 className={sectionLabel}>From the timeline</h2>
            <div className="mt-5 space-y-5">
              {story.tweets.map((tweet) => (
                <TweetCard
                  key={tweet.id}
                  tweet={tweet}
                  variant="editorial"
                  collapsible
                  showDate
                  origin="digest"
                  returnTo={returnTo}
                />
              ))}
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
                <DigestMarkdown allowLinks={false}>
                  {previous.title}
                </DigestMarkdown>
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
                <DigestMarkdown allowLinks={false}>{next.title}</DigestMarkdown>
              </div>
            </Link>
          ) : null}
        </nav>
      </article>
    </main>
  )
}
