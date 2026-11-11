import Link from 'next/link'
import BrowsingSignInPrompt from '@/components/BrowsingSignInPrompt'
import TweetCard from '@/components/TweetCard'
import TrendStoryChart from './TrendStoryChart'
import TrendStorySearch from './TrendStorySearch'
import { MUTED, SERIF } from '@/components/portal/styles'
import { buildSearchParams } from '@/lib/searchParams'
import {
  addDays,
  type TrendStory,
  type TrendStorySeries,
} from '@/lib/trendStories/core'

const dayLabel = (date: string) =>
  new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))

const shortDay = (date: string) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))

const sectionHeading = 'text-[22px] font-semibold leading-tight'

const change = (value: number | null) =>
  value === null ? 'new' : `${value > 0 ? '+' : ''}${Math.round(value)}%`

function DayNav({
  date,
  dates,
  slug,
}: {
  date: string
  dates: string[]
  slug?: string
}) {
  // dates are newest first.
  const index = dates.indexOf(date)
  const older = index >= 0 ? dates[index + 1] : dates.find((d) => d < date)
  const newer =
    index > 0 ? dates[index - 1] : [...dates].reverse().find((d) => d > date)
  const link =
    'rounded-sm text-sm font-semibold text-muted-foreground hover:text-brand'
  return (
    <nav
      aria-label="Trending days"
      className="flex items-center justify-between gap-4 border-t border-zinc-800 pt-3 dark:border-zinc-200"
    >
      {slug ? (
        <Link href={`/trending/${date}`} className={link}>
          ← All trends for {shortDay(date)}
        </Link>
      ) : older ? (
        <Link href={`/trending/${older}`} className={link}>
          ← {shortDay(older)}
        </Link>
      ) : (
        <span />
      )}
      {!slug && newer ? (
        <Link href={`/trending/${newer}`} className={link}>
          {shortDay(newer)} →
        </Link>
      ) : (
        <span className={`text-xs ${MUTED}`}>{date}</span>
      )}
    </nav>
  )
}

export function TrendDayView({
  date,
  dates,
  stories,
}: {
  date: string
  dates: string[]
  stories: TrendStory[]
}) {
  const since = stories[0]?.windowSince ?? addDays(date, -7)
  const until = stories[0]?.windowUntil ?? addDays(date, -1)
  return (
    <main className="min-h-screen bg-white dark:bg-[#111114]">
      <article className="mx-auto w-full max-w-[920px] px-5 pb-24 pt-8 sm:px-8 sm:pt-12">
        <DayNav date={date} dates={dates} />
        <header className="mt-9">
          <p className={`text-[13px] ${MUTED}`}>
            Trending in the Community Archive · {shortDay(since)}–
            {shortDay(until)}
          </p>
          <h1
            className="mt-3 text-[38px] font-semibold leading-[1.08] sm:text-[48px]"
            style={SERIF}
          >
            {dayLabel(date)}
          </h1>
          <p className={`mt-4 max-w-[62ch] text-base leading-7 ${MUTED}`}>
            The terms that rose or fell most among archive members this week,
            grouped into stories and explained by AI from the tweets that used
            them. Explanations can be wrong; the tweets are the source.
          </p>
        </header>
        <div className="mt-8 border-t-[3px] border-zinc-800 dark:border-zinc-200" />
        {stories.length ? (
          <ol className="mt-2 divide-y divide-zinc-200 dark:divide-zinc-800">
            {stories.map((story) => (
              <li key={story.slug} className="py-7">
                <Link
                  href={`/trending/${date}/${story.slug}`}
                  className="group block"
                >
                  <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
                    {story.stats.terms.map((term) => (
                      <span key={term.term}>
                        {term.term}{' '}
                        <span
                          className={
                            term.changePct !== null && term.changePct < 0
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-emerald-700 dark:text-emerald-400'
                          }
                        >
                          {change(term.changePct)}
                        </span>
                      </span>
                    ))}
                  </div>
                  <h2
                    className="mt-3 text-[26px] font-semibold leading-[1.15] group-hover:text-brand"
                    style={SERIF}
                  >
                    {story.title}
                  </h2>
                  <p className={`mt-2 text-[15px] leading-7 ${MUTED}`}>
                    {story.tooltip}
                  </p>
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <p className={`mt-8 ${MUTED}`}>
            No trend stories were written for this day.
          </p>
        )}
      </article>
    </main>
  )
}

export function TrendStoryView({
  story,
  dates,
  canSearch,
  series,
}: {
  story: TrendStory
  dates: string[]
  canSearch: boolean
  series: TrendStorySeries | null
}) {
  const returnTo = `/trending/${story.trendDate}/${story.slug}`
  return (
    <main className="min-h-screen bg-white dark:bg-[#111114]">
      <article className="mx-auto w-full max-w-[720px] px-5 pb-24 pt-8 sm:px-8 sm:pt-12">
        <DayNav date={story.trendDate} dates={dates} slug={story.slug} />
        <header className="mt-9">
          <p className={`text-[13px] ${MUTED}`}>
            Trending in the Community Archive ·{' '}
            {shortDay(story.windowSince)}–{shortDay(story.windowUntil)}
          </p>
          <h1
            className="mt-3 text-[34px] font-semibold leading-[1.1] tracking-[-0.01em] [text-wrap:pretty] sm:text-[44px]"
            style={SERIF}
          >
            {story.title}
          </h1>
          <p className="mt-5 text-[17px] leading-[1.7] text-foreground [text-wrap:pretty]">
            {story.summary}
          </p>
        </header>

        {story.bullets.length ? (
          <section className="mt-8 border-l-2 border-zinc-800 pl-5 dark:border-zinc-200">
            <h2 className="text-[17px] font-semibold" style={SERIF}>
              In brief
            </h2>
            <ul className={`mt-3 space-y-2.5 text-[15px] leading-7 ${MUTED}`}>
              {story.bullets.map((bullet) => (
                <li key={bullet} className="flex gap-2.5">
                  <span aria-hidden="true">·</span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {series ? (
          <TrendStoryChart
            data={series}
            windowSince={story.windowSince}
            windowUntil={story.windowUntil}
          />
        ) : null}

        <ul className={`mt-4 space-y-1 text-[13px] ${MUTED}`}>
          {story.stats.terms.map((term) => (
            <li key={term.term}>
              <Link
                href={`/search?${buildSearchParams(term.term)}`}
                className="font-semibold text-foreground hover:text-brand"
              >
                {term.term}
              </Link>{' '}
              · {term.tweets.toLocaleString('en-US')} tweets by{' '}
              {term.authors.toLocaleString('en-US')} accounts ·{' '}
              <span
                className={
                  term.changePct !== null && term.changePct < 0
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-emerald-700 dark:text-emerald-400'
                }
              >
                {change(term.changePct)}
              </span>{' '}
              vs prior week
            </li>
          ))}
        </ul>

        <section className="mt-12 border-t border-zinc-200 pt-8 dark:border-zinc-800">
          <h2 className={sectionHeading} style={SERIF}>
            Featured tweets
          </h2>
          <div className="mt-4">
            {story.tweets.length ? (
              story.tweets.map((tweet) => (
                <TweetCard
                  key={tweet.id}
                  tweet={tweet}
                  variant="editorial"
                  collapsible
                  showDate
                  origin="trends"
                  returnTo={returnTo}
                />
              ))
            ) : (
              <p className={MUTED}>No tweets are available for this story.</p>
            )}
          </div>
        </section>

        <section className="mt-12 border-t border-zinc-200 pt-8 dark:border-zinc-800">
          <h2 className={sectionHeading} style={SERIF}>
            More from the archive
          </h2>
          <div className="mt-4 space-y-12">
            {canSearch ? (
              story.terms.map((term) => (
                <TrendStorySearch
                  key={term}
                  term={term}
                  since={story.windowSince}
                  until={story.windowUntil}
                  excludeTweetIds={story.tweets.map((tweet) => tweet.id)}
                  returnTo={returnTo}
                />
              ))
            ) : (
              <BrowsingSignInPrompt
                title="Log in to see every tweet in this trend"
                description="Search results for this trend's terms are available to signed-in readers."
                returnTo={returnTo}
              />
            )}
          </div>
        </section>

        <p className={`mt-12 text-xs leading-5 ${MUTED}`}>
          Written by AI ({story.model ?? 'unknown model'}) from the featured
          tweets. It can be wrong; the tweets are the source.
        </p>
      </article>
    </main>
  )
}
