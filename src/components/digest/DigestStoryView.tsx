import Image from 'next/image'
import Link from 'next/link'
import TweetCard from '@/components/TweetCard'
import { CARD, MUTED, SERIF } from '@/components/portal/styles'
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
    <main className="min-h-screen bg-zinc-100/70 py-8 dark:bg-background sm:py-12">
      <article className="mx-auto w-full max-w-6xl rounded-lg border border-zinc-200 bg-white px-5 py-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:px-10 sm:py-12">
        <Link
          href={`/digest/${edition.digestDate}`}
          className="text-sm font-semibold text-muted-foreground hover:text-brand"
        >
          ← Daily Digest · {edition.digestDate}
        </Link>
        {edition.isPreview ? (
          <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
            Mock story assembled from the August 11 cluster memo. This edition
            is preview-only and has not been published.
          </div>
        ) : null}
        <header className="mt-7 max-w-4xl">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full bg-blue-100 px-2.5 py-1 font-semibold text-blue-950 dark:bg-blue-950 dark:text-blue-100">
              {story.category ?? 'Story'}
            </span>
            <span className="font-medium">{story.keyword}</span>
            <span>{story.bangers.length} bangers</span>
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
            className="mt-4 text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl"
            style={SERIF}
          >
            “{story.title}”
          </h1>
          <p className={`mt-4 text-lg leading-8 ${MUTED}`}>{story.subtitle}</p>
        </header>

        {ledeMedia ? (
          <div className="relative mt-7 aspect-[16/7] overflow-hidden rounded-md border bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
            <Image
              src={ledeMedia.url}
              alt={`Image shared in the ${story.keyword} story`}
              fill
              sizes="(max-width: 1200px) 100vw, 1100px"
              className="object-contain"
              priority
            />
          </div>
        ) : null}

        <div className="mt-8 grid items-start gap-7 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
          <div className="min-w-0 space-y-8">
            <section>
              <h2
                className={`mb-3 text-xs font-semibold uppercase tracking-[0.12em] ${MUTED}`}
              >
                The bangers
              </h2>
              <div className={`${CARD} overflow-hidden`}>
                {story.bangers.map((tweet) => (
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
            </section>

            {story.commentary.length ? (
              <section>
                <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h2
                      className={`text-xs font-semibold uppercase tracking-[0.12em] ${MUTED}`}
                    >
                      Surrounding conversation
                    </h2>
                    <p className={`mt-1 text-sm ${MUTED}`}>
                      Quote posts that extended, challenged, or remixed the
                      featured bangers.
                    </p>
                  </div>
                  <span className={`text-xs ${MUTED}`}>
                    {story.commentary.length} selected
                  </span>
                </div>
                <div className={`${CARD} overflow-hidden`}>
                  {story.commentary.map((tweet) => (
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
              </section>
            ) : null}
          </div>

          <aside className="space-y-5 lg:sticky lg:top-24">
            <section className="rounded-lg bg-blue-50 px-5 py-4 text-sm leading-6 text-blue-950 dark:bg-blue-950/30 dark:text-blue-100">
              <h2 className="font-semibold">In brief</h2>
              <ul className="mt-2 space-y-2">
                {story.bullets.map((bullet) => (
                  <li key={bullet}>• {bullet}</li>
                ))}
              </ul>
            </section>
            {story.editorialNote ? (
              <section className={`${CARD} p-4`}>
                <h2 className="font-semibold">Editor&apos;s note</h2>
                <p className={`mt-2 text-sm leading-6 ${MUTED}`}>
                  {story.editorialNote}
                </p>
              </section>
            ) : null}
            <section className={`${CARD} p-4`}>
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
