import Link from 'next/link'
import { DigestMarkdown } from '@/components/digest/DigestMarkdown'
import { DigestSubscribeButton } from '@/components/digest/DigestSubscribeButton'
import { TweetCardGrid } from '@/components/digest/TweetCardGrid'
import { weekRangeLabel } from '@/components/digest/WeeklyDigestView'
import { MUTED, SERIF } from '@/components/portal/styles'
import type { CurrentWeek } from '@/lib/digest/currentWeek'
import { CURRENT_WEEK_PATH } from '@/lib/digest/weekly'
import type { DigestStory } from '@/lib/digest/types'
import { buildSearchHref } from '@/lib/searchParams'

const dayLabel = (date: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' }).format(
    new Date(`${date}T12:00:00Z`),
  )

const sectionLabel =
  'text-[11.5px] font-bold uppercase tracking-[0.22em] text-zinc-800 dark:text-zinc-200'
const navLink =
  'rounded-sm text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand'
const titleLink =
  'rounded-sm hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand'

function StoryTitle({ story }: { story: DigestStory }) {
  return (
    <>
      {story.titleIsQuote === false ? null : '“'}
      <DigestMarkdown allowLinks={false}>{story.title}</DigestMarkdown>
      {story.titleIsQuote === false ? null : '”'}
    </>
  )
}

/**
 * The in-progress week: each published daily edition's stories, newest day
 * first, until the weekly edition replaces this page.
 */
export function CurrentWeekView({
  week,
  previousWeek,
}: {
  week: CurrentWeek
  /** Newest published weekly edition, for the way back. */
  previousWeek?: string | null
}) {
  const { dates, editions } = week
  const published = new Map(editions.map((item) => [item.digestDate, item]))
  const newestFirst = [...editions].reverse()
  const storyCount = editions.reduce(
    (sum, edition) => sum + edition.content.stories.length,
    0,
  )
  const keywords = Array.from(
    new Set(newestFirst.flatMap((edition) => edition.content.keywords)),
  ).slice(0, 14)

  return (
    <main className="min-h-screen bg-white dark:bg-[#111114]">
      <article className="mx-auto w-full max-w-[1180px] px-5 pb-24 pt-8 sm:px-8 sm:pt-12">
        <header className="max-w-[880px]">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-t border-zinc-800 pt-2.5 dark:border-zinc-200">
            <div className={sectionLabel}>The Week So Far</div>
            <nav
              aria-label="Other editions"
              className={`flex flex-wrap gap-x-4 gap-y-1 whitespace-nowrap text-[11.5px] uppercase tracking-[0.18em] ${MUTED}`}
            >
              {previousWeek ? (
                <Link href={`/digest/week/${previousWeek}`} className={navLink}>
                  ← Previous week
                </Link>
              ) : null}
              <Link href="/digest" className={navLink}>
                Daily digest
              </Link>
            </nav>
          </div>
          <h1
            className="mt-5 text-[38px] font-semibold leading-[1.05] tracking-[-0.01em] sm:text-[52px]"
            style={SERIF}
          >
            {weekRangeLabel(dates[0], dates[6])}
          </h1>
          <p className={`mt-4 max-w-[62ch] text-sm leading-[1.6] ${MUTED}`}>
            {storyCount} {storyCount === 1 ? 'story' : 'stories'} from{' '}
            {editions.length} daily{' '}
            {editions.length === 1 ? 'edition' : 'editions'} so far. This page
            grows each day; the Week in Review replaces it once the week is
            complete.
          </p>
          <ol
            aria-label="Days this week"
            className="mt-5 flex flex-wrap gap-2 text-[13px]"
          >
            {dates.map((date) => {
              const label = dayLabel(date, { weekday: 'short', day: 'numeric' })
              return (
                <li key={date}>
                  {published.has(date) ? (
                    <a
                      href={`#${date}`}
                      className="inline-block rounded-full bg-zinc-100 px-3 py-1.5 font-semibold text-zinc-800 transition-colors hover:bg-blue-100 hover:text-blue-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-blue-950 dark:hover:text-blue-100"
                    >
                      {label}
                    </a>
                  ) : (
                    <span
                      aria-label={`${label}, no edition yet`}
                      className="inline-block rounded-full border border-dashed border-zinc-300 px-3 py-1.5 text-zinc-400 dark:border-zinc-700 dark:text-zinc-500"
                    >
                      {label}
                    </span>
                  )}
                </li>
              )
            })}
          </ol>
        </header>
        <div className="mt-7 border-t-[3px] border-zinc-800 dark:border-zinc-200" />
        <div className="mt-[3px] border-t border-zinc-400 dark:border-zinc-600" />

        <div className="mt-2 grid items-start gap-y-10 lg:grid-cols-[minmax(0,1fr)_316px] lg:gap-x-14">
          <div className="min-w-0">
            {newestFirst.map((edition) => {
              const dayHref = `/digest/${edition.digestDate}`
              const [lead] = edition.content.stories
              return (
                <section
                  key={edition.digestDate}
                  id={edition.digestDate}
                  aria-labelledby={`day-${edition.digestDate}`}
                  className="scroll-mt-24 border-b border-zinc-200 py-9 last:border-b-0 dark:border-zinc-800"
                >
                  <h2 id={`day-${edition.digestDate}`} className={sectionLabel}>
                    <Link href={dayHref} className={titleLink}>
                      {dayLabel(edition.digestDate, {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                      })}
                    </Link>
                  </h2>
                  <ol className="mt-5 space-y-6">
                    {edition.content.stories.map((story, index) => (
                      <li key={story.slug}>
                        <h3
                          className={
                            index === 0
                              ? 'text-[28px] font-semibold leading-[1.14] tracking-[-0.005em] [text-wrap:pretty] sm:text-[36px]'
                              : 'text-[21px] font-semibold leading-[1.2] [text-wrap:pretty] sm:text-[24px]'
                          }
                          style={SERIF}
                        >
                          <Link
                            href={`${dayHref}/${story.slug}`}
                            className={titleLink}
                          >
                            <StoryTitle story={story} />
                          </Link>
                        </h3>
                        <p
                          className={`mt-2 max-w-[62ch] leading-[1.65] [text-wrap:pretty] ${
                            index === 0
                              ? 'text-base sm:text-[17.5px]'
                              : 'text-[15px]'
                          } ${MUTED}`}
                        >
                          <DigestMarkdown>{story.subtitle}</DigestMarkdown>
                        </p>
                        {story === lead ? (
                          <div className="mt-5">
                            <TweetCardGrid
                              tweets={story.bangers.slice(0, 2)}
                              returnTo={CURRENT_WEEK_PATH}
                            />
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                  <Link
                    href={dayHref}
                    className={`mt-6 inline-block text-sm font-semibold ${navLink}`}
                  >
                    Read {dayLabel(edition.digestDate, { weekday: 'long' })}
                    ’s edition →
                  </Link>
                </section>
              )
            })}
            <DigestSubscribeButton placement="digest" list="weekly" />
          </div>

          {keywords.length > 0 ? (
            <aside className="border-zinc-200 pt-2 dark:border-zinc-800 lg:sticky lg:top-24 lg:mt-9 lg:border-l lg:pl-10">
              <h2 className="text-[19px] font-semibold" style={SERIF}>
                Keywords so far
              </h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {keywords.map((keyword) => (
                  <Link
                    key={keyword}
                    href={buildSearchHref(keyword)}
                    aria-label={`Search Community Archive for ${keyword}`}
                    className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs transition-colors hover:bg-blue-100 hover:text-blue-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:bg-zinc-800 dark:hover:bg-blue-950 dark:hover:text-blue-100"
                  >
                    {keyword}
                  </Link>
                ))}
              </div>
            </aside>
          ) : null}
        </div>
      </article>
    </main>
  )
}
