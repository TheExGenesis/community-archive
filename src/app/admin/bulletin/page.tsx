import { loadPrompts } from '@/lib/bulletin/prompts'
import { PromptEditor } from '@/components/bulletin/PromptEditor'
import type { Metadata } from 'next'
import Link from 'next/link'
import { loadRunDashboard, requireBulletinAdmin } from '@/lib/bulletin/data'
import { RunDashboard } from '@/components/bulletin/RunDashboard'
import { RefreshButton } from '@/components/bulletin/RefreshButton'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Bulletin runs | CA admin',
  robots: { index: false, follow: false },
}

export default async function BulletinRunsPage({
  searchParams,
}: {
  searchParams?: { before?: string; prompts_before?: string }
}) {
  await requireBulletinAdmin()
  const [data, prompts] = await Promise.all([
    loadRunDashboard(searchParams?.before).catch(() => null),
    loadPrompts(searchParams?.prompts_before).catch(() => null),
  ])
  return (
    <main className="mx-auto min-h-[70vh] w-full min-w-0 max-w-7xl space-y-8 px-4 py-10 sm:px-6">
      <header>
        <Link href="/admin" className="text-sm text-brand hover:underline">
          ← Admin dashboard
        </Link>
        <p className="mt-6 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Private admin
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-semibold tracking-tight">
            Bulletin runs
          </h1>
          <Link href="/bulletin" className="text-sm text-brand hover:underline">
            Open the bulletin →
          </Link>
        </div>
        <p className="mt-3 text-muted-foreground">
          From recent tweets to useful asks and offers. See what each daily scan
          found and what still needs attention.
        </p>
      </header>
      {prompts ? (
        <PromptEditor data={prompts} olderThan={searchParams?.prompts_before} />
      ) : (
        <p role="alert" className="rounded-lg border p-5">
          Prompt history could not be loaded. Check that the prompt migration is
          installed, then refresh.
        </p>
      )}
      {data ? (
        <RunDashboard data={data} olderThan={searchParams?.before} />
      ) : (
        <div role="alert" className="space-y-4 rounded-lg border p-6">
          <p>Run history could not be loaded. Refresh to try again.</p>
          <RefreshButton />
        </div>
      )}
    </main>
  )
}
