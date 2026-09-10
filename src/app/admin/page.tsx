import Link from 'next/link'
import { CommunitySubmissionQueue } from './CommunitySubmissionQueue'
import { loadPendingCommunityProjects } from '@/lib/communityProjectDatabase'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Suspense } from 'react'
import { AdminTable } from './AdminTable'
import { AdminActivityFeed } from './AdminActivityFeed'
import { loadActivityPage } from './activityFeedData'
import {
  ADMIN_USERNAMES,
  getDisplayUsername,
  loadInitialAccounts,
  normalizeUsername,
  requireAdmin,
} from './data'

export const dynamic = 'force-dynamic'

// Kept for compatibility with older inline admin cleanup paths. Current
// export + tombstone work runs asynchronously on the Hetzner worker.
export const maxDuration = 300

async function ActivitySection() {
  try {
    const initialPage = await loadActivityPage()
    return (
      <AdminActivityFeed
        key={JSON.stringify(initialPage)}
        initialPage={initialPage}
      />
    )
  } catch {
    return (
      <AdminActivityFeed
        initialPage={null}
        initialError="Activity could not be loaded. Please try again."
      />
    )
  }
}

async function SubmissionsSection() {
  try {
    const projects = await loadPendingCommunityProjects()
    return <CommunitySubmissionQueue initialProjects={projects} />
  } catch {
    return (
      <Card>
        <CardHeader>
          <CardTitle>App submissions</CardTitle>
        </CardHeader>
        <CardContent>
          <p role="alert">
            Submissions could not be loaded. Refresh to try again.
          </p>
        </CardContent>
      </Card>
    )
  }
}

function SectionSkeleton({ label }: { label: string }) {
  return (
    <Card aria-label={label} aria-busy="true">
      <CardHeader>
        <Skeleton className="h-6 w-52" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </CardContent>
    </Card>
  )
}

async function AccountsSection({ search }: { search: string }) {
  const data = await loadInitialAccounts(search)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Accounts</CardTitle>
        <CardDescription>
          Opt-in rows load first, followed by accounts with archive data sorted
          by most recently updated. The manual opt-in input below creates an
          opt-in row by Twitter username; if we already have an archive account
          for that username the opt-in row is linked to it, otherwise it&apos;s
          stored without a Twitter id and gets linked the next time that user
          signs in or uploads an archive. Search runs against the full database;
          the table updates in place.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.warning ? (
          <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-950 dark:border-red-700 dark:bg-red-950/30 dark:text-red-100">
            {data.warning}
          </div>
        ) : null}
        <AdminTable
          key={search}
          initialRows={data.rows}
          initialCursor={data.nextCursor}
          initialSearch={search}
        />
      </CardContent>
    </Card>
  )
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: { q?: string }
}) {
  const { user } = await requireAdmin()
  const search = normalizeUsername(searchParams?.q)
  const twitterUsername = getDisplayUsername(user)

  return (
    <main className="min-h-screen bg-card dark:bg-background">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8">
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                Private admin
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                Community Archive admin dashboard
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                Visible only to{' '}
                {ADMIN_USERNAMES.map((name) => `@${name}`).join(' and ')}, with
                staging-only dev access when enabled. Reads and mutations use
                the server-side Supabase service role after the identity gate
                passes.
              </p>
            </div>
            <Badge variant="secondary">@{twitterUsername}</Badge>
          </div>
        </section>

        <Link
          href="/admin/bulletin"
          className="rounded-lg border bg-card p-5 transition-colors hover:bg-accent"
        >
          <h2 className="font-semibold">Bulletin runs →</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Daily scans, candidates, notices produced, costs and failures.
          </p>
        </Link>

        <Suspense
          fallback={<SectionSkeleton label="Loading archive activity" />}
        >
          <ActivitySection />
        </Suspense>

        <Suspense
          fallback={<SectionSkeleton label="Loading app submissions" />}
        >
          <SubmissionsSection />
        </Suspense>

        <Suspense fallback={<SectionSkeleton label="Loading accounts" />}>
          <AccountsSection search={search} />
        </Suspense>
      </div>
    </main>
  )
}
