import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { AdminTable } from './AdminTable'
import { manualOptIn } from './actions'
import {
  ADMIN_USERNAME,
  getTwitterUsername,
  loadInitialAccounts,
  normalizeUsername,
  requireAdmin,
} from './data'

export const dynamic = 'force-dynamic'

type Flash = { tone: 'ok' | 'error'; msg: string } | null

const parseFlash = (
  flash: string | undefined,
  msg: string | undefined,
): Flash => {
  if (flash !== 'ok' && flash !== 'error') return null
  const text = typeof msg === 'string' ? msg.trim() : ''
  if (!text) return null
  return { tone: flash, msg: text }
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: { q?: string; flash?: string; msg?: string }
}) {
  const { user } = await requireAdmin()
  const search = normalizeUsername(searchParams?.q)
  const flash = parseFlash(searchParams?.flash, searchParams?.msg)
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
          {flash ? (
            <div
              className={
                flash.tone === 'ok'
                  ? 'rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-100'
                  : 'rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-950 dark:border-red-700 dark:bg-red-950/30 dark:text-red-100'
              }
            >
              {flash.msg}
            </div>
          ) : null}
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
            <form
              className="grid gap-3 sm:grid-cols-[1fr_auto]"
              action={manualOptIn}
            >
              <Input name="username" placeholder="username" required />
              <Button type="submit">Opt in</Button>
            </form>
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
