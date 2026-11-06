import Link from 'next/link'
import TweetCard from '@/components/TweetCard'
import { DigestMarkdown } from '@/components/digest/DigestMarkdown'
import { DigestSubscribeButton } from '@/components/digest/DigestSubscribeButton'
import { MUTED, SERIF } from '@/components/portal/styles'
import type { WeeklyDigestEdition } from '@/lib/digest/weeklyData'

const dayLabel = (date: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' }).format(
    new Date(`${date}T12:00:00Z`),
  )

export const weekRangeLabel = (start: string, end: string) =>
  `${dayLabel(start, { day: 'numeric', month: 'long' })} – ${dayLabel(end, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })}`

const sectionLabel =
  'text-[11.5px] font-bold uppercase tracking-[0.22em] text-zinc-800 dark:text-zinc-200'
const chip =
  'rounded-full bg-zinc-100 px-2.5 py-1 font-semibold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100'
const dayLink =
  'rounded-sm text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand'

export function WeeklyDigestView({
  edition,
  weeks,
}: {
  edition: WeeklyDigestEdition
  weeks: string[]
}) {
  const content = edition.content
  const returnTo = `/digest/week/${edition.weekStart}`
  const index = weeks.indexOf(edition.weekStart)
  const newer = index > 0 ? weeks[index - 1] : null
  const older = index >= 0 && index < weeks.length - 1 ? weeks[index + 1] : null

  return (
    <main className="min-h-screen bg-white dark:bg-[#111114]">
      <article className="mx-auto w-full max-w-[880px] px-5 pb-24 pt-8 sm:px-8 sm:pt-12">
        <header>
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-t border-zinc-800 pt-2.5 dark:border-zinc-200">
            <div className={sectionLabel}>The Week in Review</div>
            <nav
              aria-label="Other weeks"
              className={`flex gap-4 text-[11.5px] uppercase tracking-[0.18em] ${MUTED}`}
            >
              {older ? (
                <Link href={`/digest/week/${older}`} className={dayLink}>
                  ← Previous week
                </Link>
              ) : null}
              {newer ? (
                <Link href={`/digest/week/${newer}`} className={dayLink}>
                  Next week →
                </Link>
              ) : null}
              <Link href="/digest" className={dayLink}>
                Daily digest
              </Link>
            </nav>
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

        <div className="mt-12">
          {content.stories.map((story) => (
            <section
              key={story.slug}
              id={story.slug}
              className="border-t-2 border-zinc-800 pb-12 pt-7 dark:border-zinc-200"
            >
              <div className="flex flex-wrap items-center gap-3 text-[13px] text-muted-foreground">
                <span className={chip}>
                  {story.kind === 'ongoing'
                    ? `Ongoing · ${story.days.length} days`
                    : 'Major'}
                </span>
                {story.continuesFrom.length > 0 ? (
                  <span className={chip}>Continuing story</span>
                ) : null}
              </div>
              <h2
                className="mt-4 text-[30px] font-semibold leading-[1.15] tracking-[-0.005em] [text-wrap:pretty] sm:text-[36px]"
                style={SERIF}
              >
                <DigestMarkdown allowLinks={false}>
                  {story.title}
                </DigestMarkdown>
              </h2>
              <p className="mt-3 text-lg leading-[1.55] text-zinc-700 [text-wrap:pretty] dark:text-zinc-300">
                <DigestMarkdown>{story.subtitle}</DigestMarkdown>
              </p>
              <ul className="mt-5 list-disc space-y-2 pl-6 leading-[1.6] marker:text-zinc-400">
                {story.bullets.map((bullet) => (
                  <li key={bullet}>
                    <DigestMarkdown>{bullet}</DigestMarkdown>
                  </li>
                ))}
              </ul>
              {story.connection ? (
                <p className={`mt-5 text-[15px] leading-[1.6] ${MUTED}`}>
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                    How these connect.{' '}
                  </span>
                  <DigestMarkdown>{story.connection}</DigestMarkdown>
                </p>
              ) : null}
              {story.continuesFrom.length > 0 ? (
                <p className={`mt-3 text-[15px] leading-[1.6] ${MUTED}`}>
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                    Continues from{' '}
                  </span>
                  {story.continuesFrom.map((ref, refIndex) => (
                    <span key={`${ref.weekStart}-${ref.slug}`}>
                      {refIndex > 0 ? '; ' : ''}
                      <Link
                        href={`/digest/week/${ref.weekStart}#${ref.slug}`}
                        className={dayLink}
                      >
                        the week of{' '}
                        {dayLabel(ref.weekStart, {
                          day: 'numeric',
                          month: 'long',
                        })}
                      </Link>
                    </span>
                  ))}
                  {story.continuityNote ? (
                    <>
                      {'. '}
                      <DigestMarkdown>{story.continuityNote}</DigestMarkdown>
                    </>
                  ) : null}
                </p>
              ) : null}
              <p className={`mt-3 text-[13px] ${MUTED}`}>
                Daily coverage:{' '}
                {story.dailyStories.map((ref, refIndex) => (
                  <span key={`${ref.digestDate}-${ref.slug}`}>
                    {refIndex > 0 ? ' · ' : ''}
                    <Link
                      href={`/digest/${ref.digestDate}/${ref.slug}`}
                      className={dayLink}
                    >
                      {dayLabel(ref.digestDate, {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                      })}
                    </Link>
                  </span>
                ))}
              </p>
              {story.tweets.length > 0 ? (
                <div className="mt-6 space-y-5">
                  {story.tweets.slice(0, 2).map((tweet) => (
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
              ) : null}
            </section>
          ))}
        </div>

        {content.alsoNotable.length > 0 ? (
          <section className="border-t-2 border-zinc-800 pt-7 dark:border-zinc-200">
            <h2 className={sectionLabel}>Also this week</h2>
            <ul className="mt-5 space-y-3 leading-[1.6]">
              {content.alsoNotable.map((item) => (
                <li
                  key={`${item.dailyStory.digestDate}-${item.dailyStory.slug}`}
                >
                  <DigestMarkdown>{item.line}</DigestMarkdown>{' '}
                  <Link
                    href={`/digest/${item.dailyStory.digestDate}/${item.dailyStory.slug}`}
                    className={`text-[13px] ${dayLink}`}
                  >
                    {dayLabel(item.dailyStory.digestDate, {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                    })}{' '}
                    →
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </article>
    </main>
  )
}
