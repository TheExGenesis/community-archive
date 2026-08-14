import Image from 'next/image'
import Link from 'next/link'
import { TweetRow } from '@/components/portal/TweetRow'
import { CARD, MUTED, SERIF } from '@/components/portal/styles'
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
  const ledeMedia = story.bangers.flatMap((tweet) => tweet.media ?? [])[0]
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
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 font-semibold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100">
              {story.keyword}
            </span>
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
            {story.title}
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

        <ul className="mt-6 space-y-2 rounded-lg bg-blue-50 px-6 py-5 text-sm leading-6 text-blue-950 dark:bg-blue-950/30 dark:text-blue-100 sm:text-base">
          {story.bullets.map((bullet) => (
            <li key={bullet}>• {bullet}</li>
          ))}
        </ul>

        <div className="mt-8 grid items-start gap-7 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
          <section className="min-w-0">
            <h2
              className={`mb-3 text-xs font-semibold uppercase tracking-[0.12em] ${MUTED}`}
            >
              The bangers
            </h2>
            <div className={`${CARD} overflow-hidden`}>
              {story.bangers.map((tweet) => (
                <TweetRow
                  key={tweet.id}
                  tweet={tweet}
                  noClamp
                  origin="digest"
                  returnTo={returnTo}
                />
              ))}
            </div>
          </section>

          <aside className={`${CARD} p-4 lg:sticky lg:top-24`}>
            <h2 className="font-semibold">Commentary</h2>
            {story.editorialNote ? (
              <p className="mt-3 rounded-md bg-blue-50 p-3 text-sm leading-6 text-blue-950 dark:bg-blue-950/30 dark:text-blue-100">
                {story.editorialNote}
              </p>
            ) : null}
            {story.commentary.length ? (
              <div className="mt-3 space-y-3">
                {story.commentary.map((tweet) => (
                  <blockquote
                    key={tweet.id}
                    className="rounded-md bg-zinc-100 p-3 text-sm leading-5 dark:bg-zinc-900"
                  >
                    <p>{tweet.text}</p>
                    <footer className={`mt-2 text-xs ${MUTED}`}>
                      @{tweet.username} · ♥ {tweet.likes.toLocaleString()}
                    </footer>
                  </blockquote>
                ))}
              </div>
            ) : !story.editorialNote ? (
              <p className={`mt-3 text-sm ${MUTED}`}>
                No commentary was selected for this story.
              </p>
            ) : null}
            <Link
              href={`/tweets/${story.bangers[0].id}?from=digest&returnTo=${encodeURIComponent(returnTo)}`}
              className="mt-4 inline-flex text-sm font-semibold text-brand hover:underline"
            >
              Open the lead banger and its archived replies →
            </Link>
          </aside>
        </div>
      </article>
    </main>
  )
}
