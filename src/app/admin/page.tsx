import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { AdminTable } from './AdminTable'
import { ManualOptInForm } from './ManualOptInForm'
import {
  ADMIN_USERNAME,
  getTwitterUsername,
  loadInitialAccounts,
  normalizeUsername,
  requireAdmin,
} from './data'

export const dynamic = 'force-dynamic'

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: { q?: string }
}) {
  const { user } = await requireAdmin()
  const search = normalizeUsername(searchParams?.q)
  const data = await loadInitialAccounts(search)
  const twitterUsername = getTwitterUsername(user)

  return (
    <main className="min-h-screen bg-white dark:bg-background">
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
                Visible only to @{ADMIN_USERNAME}, with staging-only dev access
                when enabled. Reads and mutations use the server-side Supabase
                service role after the identity gate passes.
              </p>
            </div>
            <Badge variant="secondary">@{twitterUsername}</Badge>
          </div>
          {data.warning ? (
            <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-950 dark:border-red-700 dark:bg-red-950/30 dark:text-red-100">
              {data.warning}
            </div>
          ) : null}
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Manual opt-in</CardTitle>
            <CardDescription>
              Opt someone in by Twitter username. If we already have an account
              for that username, the opt-in row is linked to it; otherwise the
              row is stored without a Twitter id and gets linked the next time
              that user signs in or uploads an archive.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ManualOptInForm />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Accounts</CardTitle>
            <CardDescription>
              Every public.optin row is pinned at the top, followed by accounts
              with archive data sorted by most recently updated. Search runs
              against the full database, not just the loaded rows. Scroll to
              load more.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AdminTable
              key={search}
              initialRows={data.rows}
              initialCursor={data.nextCursor}
              initialSearch={search}
              initialOptInCount={data.optInCount}
            />
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
