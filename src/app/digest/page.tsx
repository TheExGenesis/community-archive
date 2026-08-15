import Link from 'next/link'
import { checkIsAdmin } from '@/app/admin/data'
import { DigestEditionView } from '@/components/digest/DigestEditionView'
import { getPublishedDigest, listPublishedDigestDays } from '@/lib/digest/data'

export const metadata = { title: 'What Happened Yesterday · Community Archive' }
export const revalidate = 300

export default async function DigestPage() {
  const [edition, archive, isAdmin] = await Promise.all([
    getPublishedDigest(),
    listPublishedDigestDays(),
    checkIsAdmin(),
  ])
  if (edition) {
    return (
      <DigestEditionView
        edition={edition}
        archive={archive}
        isAdmin={isAdmin}
      />
    )
  }

  return (
    <main className="min-h-[70vh] bg-zinc-100/70 px-4 py-16 dark:bg-background">
      <div className="mx-auto max-w-3xl rounded-lg border border-dashed bg-card p-10 text-center">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          What Happened Yesterday
        </div>
        <h1 className="mt-3 font-serif text-4xl font-semibold">
          The first edition is being assembled
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-muted-foreground">
          Daily pages collect the archive&apos;s strongest conversations into a
          few readable stories. Editions are generated from a frozen 24-hour
          banger set and reviewed before publication.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/bangers?period=today"
            className="inline-flex rounded-md bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white dark:bg-white dark:text-zinc-950"
          >
            Explore today&apos;s bangers
          </Link>
          {isAdmin ? (
            <Link
              href="/admin/digest"
              className="inline-flex rounded-md border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-brand transition-colors hover:border-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:border-zinc-500 dark:hover:bg-zinc-900"
            >
              Editorial lab →
            </Link>
          ) : null}
        </div>
      </div>
    </main>
  )
}
