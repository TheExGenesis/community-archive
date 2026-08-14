import Image from 'next/image'
import Link from 'next/link'
import TweetCard from '@/components/TweetCard'
import { DigestDaySelector } from '@/components/digest/DigestDaySelector'
import type { DigestEdition } from '@/lib/digest/types'
import { firstStoryMedia } from '@/lib/digest/storyMedia'
import { buildSearchHref } from '@/lib/searchParams'
import { CARD, MUTED, SERIF } from '@/components/portal/styles'

const SUBSCRIBE_URL = 'https://xiqo.substack.com/subscribe'

const longDate = (date: string) =>
  new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`))

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
    <main className="min-h-screen bg-zinc-100/70 py-8 dark:bg-background sm:py-12">
      <article className="mx-auto w-full max-w-6xl rounded-lg border border-zinc-200 bg-white px-5 py-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:px-10 sm:py-12">
        {edition.isPreview ? (
          <div className="mb-7 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
            <span className="font-semibold">Mock edition · preview only</span>
            <span>
              Assembled from the August 11 banger-cluster research memo; not
              published.
            </span>
          </div>
        ) : null}
        <header>
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <div
                className={`text-xs font-semibold uppercase tracking-[0.14em] ${MUTED}`}
              >
                The Daily Digest · {edition.isPreview ? 'Prototype · ' : ''}№{' '}
                {edition.issueNumber} · v{edition.version}
              </div>
              <h1
                className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl"
                style={SERIF}
              >
                {longDate(edition.digestDate)}
              </h1>
            </div>
            <a
              href={SUBSCRIBE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-950"
            >
              Get the weekly email
            </a>
          </div>
          <p
            className="mt-7 rounded-lg bg-blue-50 px-5 py-4 text-lg leading-8 text-blue-950 dark:bg-blue-950/30 dark:text-blue-100 sm:px-6"
            style={SERIF}
          >
            {content.executiveSummary}
          </p>
        </header>

        <div className="mt-8 grid items-start gap-7 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
          <div className="min-w-0 space-y-7">
            <section>
              <div
                className={`mb-2 text-xs font-semibold uppercase tracking-[0.12em] ${MUTED}`}
              >
                Top banger
              </div>
              <TweetCard
                tweet={content.topBanger}
                featuredRank={1}
                noClamp
                showDate
                origin="digest"
                returnTo={returnTo}
              />
            </section>

            <div className="border-t border-zinc-950 pt-7 dark:border-zinc-100">
              <div className="space-y-6">
                {content.stories.map((story) => (
                  <article
                    key={story.slug}
                    className={`${CARD} overflow-hidden`}
                  >
                    {firstStoryMedia(story) ? (
                      <Link
                        href={`/digest/${edition.digestDate}/${story.slug}`}
                        className="relative block aspect-[16/7] overflow-hidden border-b bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900"
                        aria-label={`Read ${story.title}`}
                      >
                        <Image
                          src={firstStoryMedia(story)!.url}
                          alt={`Image from ${story.title}`}
                          fill
                          sizes="(max-width: 1024px) 100vw, 720px"
                          className="object-cover transition duration-300 hover:scale-[1.01]"
                        />
                      </Link>
                    ) : null}
                    <div className="p-5 sm:p-6">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="rounded-full bg-blue-100 px-2.5 py-1 font-semibold text-blue-950 dark:bg-blue-950 dark:text-blue-100">
                          {story.category ?? 'Story'}
                        </span>
                        <Link
                          href={buildSearchHref(story.keyword)}
                          className="rounded-sm font-medium hover:text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        >
                          {story.keyword}
                        </Link>
                      </div>
                      <h2
                        className="mt-3 text-2xl font-semibold leading-tight sm:text-3xl"
                        style={SERIF}
                      >
                        <Link
                          href={`/digest/${edition.digestDate}/${story.slug}`}
                          className="rounded-sm hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        >
                          “{story.title}”
                        </Link>
                      </h2>
                      <p
                        className={`mt-2 text-sm leading-6 sm:text-base ${MUTED}`}
                      >
                        {story.subtitle}
                      </p>
                    </div>
                    <div className="border-t dark:border-zinc-800">
                      {story.bangers.slice(0, 2).map((tweet) => (
                        <TweetCard
                          key={tweet.id}
                          tweet={tweet}
                          noClamp
                          showDate
                          origin="digest"
                          returnTo={returnTo}
                        />
                      ))}
                    </div>
                    <div className="border-t px-5 py-4 dark:border-zinc-800 sm:px-6">
                      <Link
                        href={`/digest/${edition.digestDate}/${story.slug}`}
                        className="inline-flex text-sm font-semibold text-brand hover:underline"
                      >
                        Read the full story and surrounding conversation →
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>

          <aside className="space-y-5 lg:sticky lg:top-24">
            <DigestDaySelector
              currentDate={edition.digestDate}
              editions={archive}
            />
            <section className={`${CARD} p-5`}>
              <h2 className="font-semibold">Keywords in this edition</h2>
              <div className="mt-3 flex flex-wrap gap-2">
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
            <section className={`${CARD} p-5 text-sm leading-6 ${MUTED}`}>
              <p>
                {edition.isPreview
                  ? `Five public stories selected from 20 discovered clusters across the top ${content.source.selectedCount} bangers in the August 11 research snapshot.`
                  : `Clustered from ${content.source.selectedCount} selected bangers in a frozen 24-hour snapshot.`}{' '}
                Keywords are required to occur in the included posts.
              </p>
              <Link
                href="/bangers?period=today"
                className="mt-3 inline-flex font-semibold text-brand hover:underline"
              >
                Explore today&apos;s bangers →
              </Link>
            </section>
            {archive.length > 1 ? (
              <section className={`${CARD} p-5`}>
                <h2 className="font-semibold">Recent editions</h2>
                <div className="mt-3 space-y-2">
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

        <footer className={`mt-10 border-t pt-5 text-xs leading-5 ${MUTED}`}>
          {edition.isPreview
            ? 'Prototype assembled from a frozen research snapshot. Tweet text and engagement were hydrated for this preview; editorial summaries come from the cluster memo.'
            : 'Curated automatically from the previous 24 hours of archive bangers and reviewed through the Daily Digest lab before publication.'}
        </footer>
      </article>
    </main>
  )
}
