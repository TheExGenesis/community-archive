import Image from 'next/image'
import Link from 'next/link'
import TweetCard from '@/components/TweetCard'
import { MUTED, SERIF } from '@/components/portal/styles'
import { firstStoryMedia } from '@/lib/digest/storyMedia'
import type { DigestEdition, DigestStory } from '@/lib/digest/types'

const timeLabel = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
        hour12: false,
      }).format(new Date(value)) + ' UTC'
    : null

const sectionLabel =
  'text-[11.5px] font-bold uppercase tracking-[0.22em] text-zinc-800 dark:text-zinc-200'

export function DigestStoryView({
  edition,
  story,
}: {
  edition: DigestEdition
  story: DigestStory
}) {
  const returnTo = `/digest/${edition.digestDate}/${story.slug}`
  const ledeMedia = firstStoryMedia(story)
  const archivedQuotes = story.bangers.reduce(
    (total, tweet) => total + (tweet.quoteCount ?? 0),
    0,
  )

  return (
    <main className="min-h-screen bg-white dark:bg-[#111114]">
      <article className="mx-auto w-full max-w-[1160px] px-5 pb-24 pt-8 sm:px-8 sm:pt-12 lg:px-12">
        <div className="flex items-center justify-between gap-4 border-t border-zinc-800 pt-3 dark:border-zinc-200">
          <Link
            href={`/digest/${edition.digestDate}`}
            className="rounded-sm text-sm font-semibold text-muted-foreground hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            ← The Daily Digest
          </Link>
          <span className={`text-xs ${MUTED}`}>{edition.digestDate}</span>
        </div>

        {edition.isPreview ? (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-y border-amber-300/70 py-2.5 text-xs text-amber-900 dark:border-amber-800/70 dark:text-amber-200">
            <span className="font-bold uppercase tracking-[0.14em]">
              Mock story · preview only
            </span>
            <span>
              Assembled from the August 11 cluster memo; not published.
            </span>
          </div>
        ) : null}

        <header className="mt-9 max-w-4xl">
          <div className="flex flex-wrap items-center gap-2.5 text-[13px] text-muted-foreground">
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 font-semibold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100">
              {story.category ?? 'Story'}
            </span>
            <span className="font-semibold text-zinc-700 dark:text-zinc-300">
              {story.keyword}
            </span>
            <span>· {story.bangers.length} bangers</span>
            <span>
              · {archivedQuotes} archived quote
              {archivedQuotes === 1 ? '' : 's'}
            </span>
            {story.replyCount > 0 ? (
              <span>· {story.replyCount} replies</span>
            ) : null}
            {story.peakedAt ? (
              <span>· peaked {timeLabel(story.peakedAt)}</span>
            ) : null}
          </div>
          <h1
            className="mt-5 text-[42px] font-semibold leading-[1.06] tracking-[-0.01em] [text-wrap:pretty] sm:text-[56px]"
            style={SERIF}
          >
            “{story.title}”
          </h1>
          <p
            className={`mt-5 max-w-[64ch] text-lg leading-[1.65] [text-wrap:pretty] sm:text-xl ${MUTED}`}
          >
            {story.subtitle}
          </p>
        </header>

        <div className="mt-8 border-t-[3px] border-zinc-800 dark:border-zinc-200" />
        <div className="mt-[3px] border-t border-zinc-400 dark:border-zinc-600" />

        {ledeMedia ? (
          <div className="relative mt-8 aspect-[16/8] overflow-hidden rounded-[4px] border border-zinc-200 bg-white dark:border-zinc-800">
            <Image
              src={ledeMedia.url}
              alt={`Image shared in the ${story.keyword} story`}
              fill
              sizes="(max-width: 1200px) 100vw, 1064px"
              className="object-contain"
              priority
            />
          </div>
        ) : null}

        <div className="mt-10 grid items-start lg:grid-cols-[minmax(0,1fr)_316px] lg:gap-x-14">
          <div className="min-w-0 space-y-12">
            <section>
              <div className="flex items-center gap-3.5">
                <h2 className={sectionLabel}>The bangers</h2>
                <span className="flex-1 border-t border-zinc-200 dark:border-zinc-800" />
              </div>
              <div className="mt-5">
                {story.bangers.map((tweet) => (
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
            </section>

            {story.commentary.length ? (
              <section>
                <div className="flex items-center gap-3.5">
                  <h2 className={sectionLabel}>Surrounding conversation</h2>
                  <span className="flex-1 border-t border-zinc-200 dark:border-zinc-800" />
                  <span className={`text-xs ${MUTED}`}>
                    {story.commentary.length} selected
                  </span>
                </div>
                <p className={`mt-2 text-sm leading-6 ${MUTED}`}>
                  Quote posts that extended, challenged, or remixed the featured
                  bangers.
                </p>
                <div className="mt-5">
                  {story.commentary.map((tweet) => (
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
              </section>
            ) : null}
          </div>

          <aside className="mt-12 border-zinc-200 pt-8 dark:border-zinc-800 lg:sticky lg:top-24 lg:mt-0 lg:border-l lg:py-0 lg:pl-10">
            <section>
              <h2 className="text-[19px] font-semibold" style={SERIF}>
                In brief
              </h2>
              <ul className={`mt-4 space-y-3 text-sm leading-6 ${MUTED}`}>
                {story.bullets.map((bullet) => (
                  <li key={bullet} className="flex gap-2.5">
                    <span aria-hidden="true">✦</span>
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </section>

            {story.editorialNote ? (
              <section className="mt-8 border-t border-zinc-200 pt-7 dark:border-zinc-800">
                <h2 className="text-[19px] font-semibold" style={SERIF}>
                  Editor&apos;s note
                </h2>
                <p className={`mt-3 text-sm leading-6 ${MUTED}`}>
                  {story.editorialNote}
                </p>
              </section>
            ) : null}

            <section className="mt-8 border-t border-zinc-200 pt-7 dark:border-zinc-800">
              <Link
                href={`/tweets/${story.bangers[0].id}?from=digest&returnTo=${encodeURIComponent(returnTo)}`}
                className="inline-flex text-sm font-semibold text-brand hover:underline"
              >
                Open the lead banger and all archived replies →
              </Link>
            </section>
          </aside>
        </div>
      </article>
    </main>
  )
}
