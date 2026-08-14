import Link from 'next/link'
import TweetCard from '@/components/TweetCard'
import { DigestDaySelector } from '@/components/digest/DigestDaySelector'
import type { DigestEdition } from '@/lib/digest/types'
import { buildSearchHref } from '@/lib/searchParams'
import { MUTED, SERIF } from '@/components/portal/styles'

const SUBSCRIBE_URL = 'https://xiqo.substack.com/subscribe'

const longDate = (date: string) =>
  new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`))

const sectionLabel =
  'text-[11.5px] font-bold uppercase tracking-[0.22em] text-zinc-800 dark:text-zinc-200'

export function DigestEditionView({
  edition,
  archive,
}: {
  edition: DigestEdition
  archive: DigestEdition[]
}) {
  const content = edition.content
  const returnTo = `/digest/${edition.digestDate}`

  return (
    <main className="min-h-screen bg-white dark:bg-[#111114]">
      <article className="mx-auto w-full max-w-[1160px] px-5 pb-24 pt-8 sm:px-8 sm:pt-12 lg:px-12">
        {edition.isPreview ? (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2 border-y border-amber-300/70 py-2.5 text-xs text-amber-900 dark:border-amber-800/70 dark:text-amber-200">
            <span className="font-bold uppercase tracking-[0.14em]">
              Mock edition · preview only
            </span>
            <span>
              Assembled from the August 11 banger-cluster research memo; not
              published.
            </span>
          </div>
        ) : null}

        <header>
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-t border-zinc-800 pt-2.5 dark:border-zinc-200">
            <div className={sectionLabel}>The Daily Digest</div>
            <div
              className={`text-[11.5px] uppercase tracking-[0.18em] ${MUTED}`}
            >
              {edition.isPreview ? 'Prototype · ' : ''}№ {edition.issueNumber} ·
              v{edition.version}
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <h1
              className="text-[42px] font-semibold leading-[1.02] tracking-[-0.01em] sm:text-[56px] lg:text-[66px]"
              style={SERIF}
            >
              {longDate(edition.digestDate)}
            </h1>
            <a
              href={SUBSCRIBE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit shrink-0 items-center rounded-[4px] border border-zinc-300 px-4 py-2.5 text-sm font-semibold transition-colors hover:border-zinc-500 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:border-zinc-700 dark:hover:border-zinc-500 dark:hover:bg-zinc-900 sm:mb-2"
            >
              Get the weekly email
            </a>
          </div>

          <div className="mt-7 border-t-[3px] border-zinc-800 dark:border-zinc-200" />
          <div className="mt-[3px] border-t border-zinc-400 dark:border-zinc-600" />

          <ul
            className="mt-7 max-w-[70ch] list-disc space-y-2.5 pl-6 text-lg italic leading-[1.55] text-zinc-700 marker:text-zinc-400 dark:text-zinc-300 dark:marker:text-zinc-600 sm:text-[20px]"
            style={SERIF}
          >
            {content.executiveSummary.map((bullet) => (
              <li key={bullet} className="pl-1 [text-wrap:pretty]">
                {bullet}
              </li>
            ))}
          </ul>
        </header>

        <div className="mt-12 grid items-start lg:grid-cols-[minmax(0,1fr)_316px] lg:gap-x-14">
          <div className="min-w-0">
            <section>
              <div className="flex items-center gap-3.5">
                <span className={sectionLabel}>Representative tweet</span>
                <span className="flex-1 border-t border-zinc-200 dark:border-zinc-800" />
              </div>
              <div className="mt-6">
                <TweetCard
                  tweet={content.topBanger}
                  variant="editorial"
                  featuredRank={1}
                  noClamp
                  showDate
                  origin="digest"
                  returnTo={returnTo}
                />
              </div>
            </section>

            <div className="mt-12">
              {content.stories.map((story) => {
                const storyHref = `/digest/${edition.digestDate}/${story.slug}`

                return (
                  <article
                    key={story.slug}
                    className="border-t-2 border-zinc-800 pb-1 pt-7 dark:border-zinc-200"
                  >
                    <div className="flex flex-wrap items-center gap-3 text-[13px] text-muted-foreground">
                      <span className="rounded-full bg-zinc-100 px-2.5 py-1 font-semibold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100">
                        {story.category ?? 'Story'}
                      </span>
                    </div>

                    <h2
                      className="mt-4 text-[34px] font-semibold leading-[1.14] tracking-[-0.005em] [text-wrap:pretty] sm:text-[42px]"
                      style={SERIF}
                    >
                      <Link
                        href={storyHref}
                        className="rounded-sm hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                      >
                        “{story.title}”
                      </Link>
                    </h2>
                    <p
                      className={`mt-3 max-w-[60ch] text-base leading-[1.65] [text-wrap:pretty] sm:text-[17.5px] ${MUTED}`}
                    >
                      {story.subtitle}
                    </p>

                    <div className="mt-8">
                      {story.bangers.slice(0, 2).map((tweet) => (
                        <TweetCard
                          key={tweet.id}
                          tweet={tweet}
                          variant="editorial"
                          noClamp
                          showDate
                          origin="digest"
                          returnTo={returnTo}
                        />
                      ))}
                    </div>

                    <Link
                      href={storyHref}
                      className="mt-5 inline-flex rounded-sm text-sm font-semibold text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      Read the full story and surrounding conversation →
                    </Link>

                    <div className="my-12 flex items-center gap-4 text-zinc-400 dark:text-zinc-600">
                      <span className="flex-1 border-t border-zinc-200 dark:border-zinc-800" />
                      <span className="text-[13px]" aria-hidden="true">
                        ✦
                      </span>
                      <span className="flex-1 border-t border-zinc-200 dark:border-zinc-800" />
                    </div>
                  </article>
                )
              })}
            </div>
          </div>

          <aside className="mt-2 border-zinc-200 pt-10 dark:border-zinc-800 lg:sticky lg:top-24 lg:mt-0 lg:border-l lg:py-0 lg:pl-10">
            <DigestDaySelector
              currentDate={edition.digestDate}
              editions={archive}
              variant="editorial"
            />

            <section className="mt-8 border-t border-zinc-200 pt-7 dark:border-zinc-800">
              <h2 className="text-[19px] font-semibold" style={SERIF}>
                Keywords in this edition
              </h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {content.keywords.map((keyword) => (
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
            </section>

            <section
              className={`mt-8 border-t border-zinc-200 pt-7 text-[13.5px] leading-[1.75] dark:border-zinc-800 ${MUTED}`}
            >
              <p className="[text-wrap:pretty]">
                {edition.isPreview
                  ? `Five public stories selected from 20 discovered clusters across the top ${content.source.selectedCount} bangers in the August 11 research snapshot.`
                  : `Clustered from ${content.source.selectedCount} selected bangers in a frozen 24-hour snapshot.`}{' '}
                Keywords are required to occur in the included posts.
              </p>
              <Link
                href="/bangers?period=today"
                className="mt-4 inline-flex font-semibold text-brand hover:underline"
              >
                Explore today&apos;s bangers →
              </Link>
            </section>

            {archive.length > 1 ? (
              <section className="mt-8 border-t border-zinc-200 pt-7 dark:border-zinc-800">
                <h2 className="text-[19px] font-semibold" style={SERIF}>
                  Recent editions
                </h2>
                <div className="mt-4 space-y-2">
                  {archive
                    .filter((item) => item.id !== edition.id)
                    .slice(0, 6)
                    .map((item) => (
                      <Link
                        key={item.id}
                        href={`/digest/${item.digestDate}`}
                        className="block text-sm text-muted-foreground hover:text-brand hover:underline"
                      >
                        {longDate(item.digestDate)}
                      </Link>
                    ))}
                </div>
              </section>
            ) : null}
          </aside>
        </div>

        <footer className={`mt-4 border-t pt-5 text-xs leading-5 ${MUTED}`}>
          {edition.isPreview
            ? 'Prototype assembled from a frozen research snapshot. Tweet text and engagement were hydrated for this preview; editorial summaries come from the cluster memo.'
            : 'Curated automatically from the previous 24 hours of archive bangers and reviewed through the Daily Digest lab before publication.'}
        </footer>
      </article>
    </main>
  )
}
