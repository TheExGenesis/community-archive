import Link from 'next/link'
import { DigestEditionView } from '@/components/digest/DigestEditionView'
import { getPublishedDigest, listPublishedDigests } from '@/lib/digest/data'

export const metadata = { title: 'Daily Digest · Community Archive' }
export const revalidate = 300

export default async function DigestPage() {
  const [edition, archive] = await Promise.all([
    getPublishedDigest(),
    listPublishedDigests(),
  ])
  if (edition) return <DigestEditionView edition={edition} archive={archive} />

  return (
    <main className="min-h-[70vh] bg-zinc-100/70 px-4 py-16 dark:bg-background">
      <div className="mx-auto max-w-3xl rounded-lg border border-dashed bg-card p-10 text-center">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Daily Digest
        </div>
        <h1 className="mt-3 font-serif text-4xl font-semibold">
          The first edition is being assembled
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-muted-foreground">
          Daily pages collect the archive&apos;s strongest conversations into a
          few readable stories. Editions are generated from a frozen 24-hour
          banger set and reviewed before publication.
        </p>
        <Link
          href="/bangers?period=today"
          className="mt-6 inline-flex rounded-md bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white dark:bg-white dark:text-zinc-950"
        >
          Explore today&apos;s bangers
        </Link>
      </div>
    </main>
  )
}
