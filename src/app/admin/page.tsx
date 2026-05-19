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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { createServerAdminClient, createServerClient } from '@/utils/supabase'
import type { User } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

const ADMIN_USERNAME = 'exgenesis'
const DELETE_EXPORT_BUCKET = 'admin-deleted-user-data'
const DEFAULT_LIMIT = 50

type OptInRecord = {
  id: string
  username: string
  twitter_user_id: string | null
  opted_in: boolean
  explicit_optout: boolean | null
  opt_out_reason: string | null
  updated_at: string | null
  opted_in_at: string | null
  opted_out_at: string | null
}

type AccountRecord = {
  account_id: string
  username: string
  account_display_name: string
  num_tweets: number | null
  created_via: string
  updated_at: string | null
}

type AccountAdminRow = AccountRecord & {
  archiveUploadCount: number
  blockedFromScraping: boolean
  optInRecord: OptInRecord | null
}

type AdminData = {
  optInRows: Array<OptInRecord & { account: AccountRecord | null }>
  accountRows: AccountAdminRow[]
  warnings: string[]
}

const getMetadataString = (
  metadata: Record<string, unknown>,
  keys: string[],
) => {
  for (const key of keys) {
    const value = metadata[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return null
}

const getTwitterUsername = (user: User) => {
  const userMetadata = user.user_metadata ?? {}
  const appMetadata = user.app_metadata ?? {}
  const twitterIdentity =
    user.identities?.find((identity) =>
      ['twitter', 'x'].includes(identity.provider ?? ''),
    ) ?? user.identities?.[0]
  const identityData = twitterIdentity?.identity_data ?? {}

  return getMetadataString(
    { ...identityData, ...appMetadata, ...userMetadata },
    ['user_name', 'preferred_username', 'username', 'screen_name'],
  )?.toLowerCase()
}

async function requireAdmin() {
  const cookieStore = await cookies()
  const supabase = createServerClient(cookieStore)
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/login?redirect=/admin')
  }

  if (getTwitterUsername(user) !== ADMIN_USERNAME) {
    notFound()
  }

  return { user, cookieStore }
}

async function getAdminClient() {
  const { cookieStore } = await requireAdmin()
  return createServerAdminClient(cookieStore)
}

const normalizeSearch = (value: string | undefined) =>
  value?.trim().replace(/^@/, '').slice(0, 80) ?? ''

const formatDate = (value: string | null) => {
  if (!value) {
    return 'never'
  }

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

const compactNumber = (value: number | null) =>
  value == null ? 'unknown' : new Intl.NumberFormat('en').format(value)

const uniqueBy = <T,>(items: T[], getKey: (item: T) => string) =>
  Array.from(
    items.reduce((map, item) => {
      const key = getKey(item)
      if (!map.has(key)) {
        map.set(key, item)
      }
      return map
    }, new Map<string, T>()),
  ).map(([, value]) => value)

async function fetchAccountRows(
  admin: Awaited<ReturnType<typeof getAdminClient>>,
  search: string,
): Promise<AccountRecord[]> {
  const columns =
    'account_id, username, account_display_name, num_tweets, created_via, updated_at'

  if (!search) {
    const { data, error } = await admin
      .from('all_account')
      .select(columns)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(DEFAULT_LIMIT)

    if (error) {
      throw error
    }

    return (data ?? []) as AccountRecord[]
  }

  const [usernameResponse, idResponse] = await Promise.all([
    admin
      .from('all_account')
      .select(columns)
      .ilike('username', `%${search}%`)
      .limit(DEFAULT_LIMIT),
    admin.from('all_account').select(columns).eq('account_id', search).limit(1),
  ])

  if (usernameResponse.error) {
    throw usernameResponse.error
  }

  if (idResponse.error) {
    throw idResponse.error
  }

  return uniqueBy(
    [
      ...((idResponse.data ?? []) as AccountRecord[]),
      ...((usernameResponse.data ?? []) as AccountRecord[]),
    ],
    (account) => account.account_id,
  )
}

async function fetchOptInMatches(
  admin: Awaited<ReturnType<typeof getAdminClient>>,
  accounts: AccountRecord[],
) {
  const accountIds = accounts.map((account) => account.account_id)
  const usernames = accounts.map((account) => account.username.toLowerCase())
  const select =
    'id, username, twitter_user_id, opted_in, explicit_optout, opt_out_reason, updated_at, opted_in_at, opted_out_at'

  const [byTwitterId, byUsername] = await Promise.all([
    accountIds.length
      ? admin.from('optin').select(select).in('twitter_user_id', accountIds)
      : Promise.resolve({ data: [], error: null }),
    usernames.length
      ? admin.from('optin').select(select).in('username', usernames)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (byTwitterId.error) {
    throw byTwitterId.error
  }

  if (byUsername.error) {
    throw byUsername.error
  }

  return uniqueBy(
    [
      ...((byTwitterId.data ?? []) as OptInRecord[]),
      ...((byUsername.data ?? []) as OptInRecord[]),
    ],
    (record) => record.id,
  )
}

async function fetchArchiveUploadCounts(
  admin: Awaited<ReturnType<typeof getAdminClient>>,
  accountIds: string[],
) {
  if (!accountIds.length) {
    return new Map<string, number>()
  }

  const { data, error } = await admin
    .from('archive_upload')
    .select('account_id')
    .in('account_id', accountIds)

  if (error) {
    throw error
  }

  return (data ?? []).reduce((counts, row) => {
    counts.set(row.account_id, (counts.get(row.account_id) ?? 0) + 1)
    return counts
  }, new Map<string, number>())
}

async function fetchScrapeBlocklist(
  admin: Awaited<ReturnType<typeof getAdminClient>>,
  accountIds: string[],
) {
  if (!accountIds.length) {
    return { blockedAccountIds: new Set<string>(), warning: null }
  }

  const tesClient = admin.schema('tes' as never) as any
  const { data, error } = await tesClient
    .from('blocked_scraping_users')
    .select('account_id')
    .in('account_id', accountIds)

  if (error) {
    return {
      blockedAccountIds: new Set<string>(),
      warning: `Could not read tes.blocked_scraping_users: ${error.message}`,
    }
  }

  return {
    blockedAccountIds: new Set(
      ((data ?? []) as Array<{ account_id: string }>).map(
        (row) => row.account_id,
      ),
    ),
    warning: null,
  }
}

async function fetchAdminData(search: string): Promise<AdminData> {
  const admin = await getAdminClient()
  const warnings: string[] = []
  const optInSelect =
    'id, username, twitter_user_id, opted_in, explicit_optout, opt_out_reason, updated_at, opted_in_at, opted_out_at'

  const [optInResponse, accountRows] = await Promise.all([
    admin
      .from('optin')
      .select(optInSelect)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(DEFAULT_LIMIT),
    fetchAccountRows(admin, search),
  ])

  if (optInResponse.error) {
    throw optInResponse.error
  }

  const optInRecords = (optInResponse.data ?? []) as OptInRecord[]
  const optInAccountIds = optInRecords
    .map((record) => record.twitter_user_id)
    .filter((id): id is string => Boolean(id))
  const optInUsernames = optInRecords.map((record) =>
    record.username.toLowerCase(),
  )

  const accountIds = accountRows.map((account) => account.account_id)
  const [
    optInMatches,
    uploadCounts,
    scrapeBlocklist,
    accountsByIdResponse,
    accountsByUsernameResponse,
  ] = await Promise.all([
    fetchOptInMatches(admin, accountRows),
    fetchArchiveUploadCounts(admin, accountIds),
    fetchScrapeBlocklist(admin, accountIds),
    optInAccountIds.length
      ? admin
          .from('all_account')
          .select(
            'account_id, username, account_display_name, num_tweets, created_via, updated_at',
          )
          .in('account_id', optInAccountIds)
      : Promise.resolve({ data: [], error: null }),
    optInUsernames.length
      ? admin
          .from('all_account')
          .select(
            'account_id, username, account_display_name, num_tweets, created_via, updated_at',
          )
          .in('username', optInUsernames)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (scrapeBlocklist.warning) {
    warnings.push(scrapeBlocklist.warning)
  }

  if (accountsByIdResponse.error) {
    throw accountsByIdResponse.error
  }

  if (accountsByUsernameResponse.error) {
    throw accountsByUsernameResponse.error
  }

  const accountsForOptIns = uniqueBy(
    [
      ...((accountsByIdResponse.data ?? []) as AccountRecord[]),
      ...((accountsByUsernameResponse.data ?? []) as AccountRecord[]),
    ],
    (account) => account.account_id,
  )
  const accountsById = new Map(
    accountsForOptIns.map((account) => [account.account_id, account]),
  )
  const accountsByUsername = new Map(
    accountsForOptIns.map((account) => [
      account.username.toLowerCase(),
      account,
    ]),
  )

  const optInByTwitterId = new Map(
    optInMatches
      .filter((record) => record.twitter_user_id)
      .map((record) => [record.twitter_user_id, record]),
  )
  const optInByUsername = new Map(
    optInMatches.map((record) => [record.username.toLowerCase(), record]),
  )

  return {
    optInRows: optInRecords.map((record) => ({
      ...record,
      account:
        (record.twitter_user_id
          ? accountsById.get(record.twitter_user_id)
          : null) ??
        accountsByUsername.get(record.username.toLowerCase()) ??
        null,
    })),
    accountRows: accountRows.map((account) => ({
      ...account,
      archiveUploadCount: uploadCounts.get(account.account_id) ?? 0,
      blockedFromScraping: scrapeBlocklist.blockedAccountIds.has(
        account.account_id,
      ),
      optInRecord:
        optInByTwitterId.get(account.account_id) ??
        optInByUsername.get(account.username.toLowerCase()) ??
        null,
    })),
    warnings,
  }
}

async function setOptInRecord(formData: FormData) {
  'use server'

  const admin = await getAdminClient()
  const id = String(formData.get('id') ?? '')
  const twitterUserId = String(formData.get('twitter_user_id') ?? '')
  const state = String(formData.get('state') ?? '')
  const reason = String(formData.get('reason') ?? '').trim()

  if (!id) {
    throw new Error('Missing opt-in record id')
  }

  const update =
    state === 'opted-in'
      ? {
          opted_in: true,
          explicit_optout: false,
          opt_out_reason: null,
          twitter_user_id: twitterUserId || null,
        }
      : state === 'opted-out'
        ? {
            opted_in: false,
            explicit_optout: true,
            opt_out_reason: reason || 'Admin manual opt-out',
            twitter_user_id: twitterUserId || null,
          }
        : {
            opted_in: false,
            explicit_optout: false,
            opt_out_reason: null,
            twitter_user_id: twitterUserId || null,
          }

  const { error } = await admin.from('optin').update(update).eq('id', id)

  if (error) {
    throw error
  }

  revalidatePath('/admin')
}

async function setScrapeBlock(formData: FormData) {
  'use server'

  const admin = await getAdminClient()
  const accountId = String(formData.get('account_id') ?? '')
  const blocked = String(formData.get('blocked') ?? '') === 'true'

  if (!accountId) {
    throw new Error('Missing account id')
  }

  const tesClient = admin.schema('tes' as never) as any
  const response = blocked
    ? await tesClient
        .from('blocked_scraping_users')
        .upsert({ account_id: accountId }, { onConflict: 'account_id' })
    : await tesClient
        .from('blocked_scraping_users')
        .delete()
        .eq('account_id', accountId)

  if (response.error) {
    throw response.error
  }

  revalidatePath('/admin')
}

function OptInStatusBadge({ record }: { record: OptInRecord | null }) {
  if (!record) {
    return <Badge variant="outline">No opt-in row</Badge>
  }

  if (record.explicit_optout) {
    return <Badge variant="destructive">Explicit opt-out</Badge>
  }

  if (record.opted_in) {
    return <Badge>Opted in</Badge>
  }

  return <Badge variant="secondary">Not opted in</Badge>
}

function OptInActions({
  record,
  accountId,
}: {
  record: OptInRecord
  accountId?: string
}) {
  return (
    <form action={setOptInRecord} className="min-w-64 flex flex-col gap-2">
      <input type="hidden" name="id" value={record.id} />
      <input
        type="hidden"
        name="twitter_user_id"
        value={accountId ?? record.twitter_user_id ?? ''}
      />
      <Input
        name="reason"
        placeholder="Opt-out reason"
        defaultValue={record.opt_out_reason ?? ''}
        className="h-8"
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" name="state" value="opted-in">
          Opt in
        </Button>
        <Button size="sm" variant="destructive" name="state" value="opted-out">
          Opt out
        </Button>
        <Button size="sm" variant="outline" name="state" value="neutral">
          Clear
        </Button>
      </div>
    </form>
  )
}

function ScrapeBlockAction({
  accountId,
  blocked,
}: {
  accountId: string
  blocked: boolean
}) {
  return (
    <form action={setScrapeBlock}>
      <input type="hidden" name="account_id" value={accountId} />
      <input type="hidden" name="blocked" value={blocked ? 'false' : 'true'} />
      <Button size="sm" variant={blocked ? 'outline' : 'destructive'}>
        {blocked ? 'Unblock scraping' : 'Block scraping'}
      </Button>
    </form>
  )
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: { q?: string }
}) {
  const { user } = await requireAdmin()
  const search = normalizeSearch(searchParams?.q)
  const data = await fetchAdminData(search)
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
                Visible only to @{ADMIN_USERNAME}. Reads and mutations use the
                server-side Supabase service role after the Twitter identity
                gate passes.
              </p>
            </div>
            <Badge variant="secondary">@{twitterUsername}</Badge>
          </div>
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
            Delete/export workflows are intentionally not wired to a button yet.
            The private Supabase bucket for pre-delete exports is{' '}
            <code>{DELETE_EXPORT_BUCKET}</code>.
          </div>
          {data.warnings.map((warning) => (
            <div
              key={warning}
              className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-950 dark:border-red-700 dark:bg-red-950/30 dark:text-red-100"
            >
              {warning}
            </div>
          ))}
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Find accounts</CardTitle>
            <CardDescription>
              Search by username or exact Twitter account id. Without search,
              this shows recently updated accounts that have archive data.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-3 sm:flex-row" action="/admin">
              <Input
                name="q"
                defaultValue={search}
                placeholder="exgenesis or 123456789"
              />
              <Button>Search</Button>
              {search ? (
                <Button asChild variant="outline">
                  <a href="/admin">Clear</a>
                </Button>
              ) : null}
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Opt-in table rows</CardTitle>
            <CardDescription>
              Default operating table for every row in the public.optin table,
              including opted-in, explicitly opted-out, and neutral records.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Archive data</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.optInRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="font-medium">@{row.username}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.twitter_user_id ?? 'No Twitter id on opt-in row'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <OptInStatusBadge record={row} />
                    </TableCell>
                    <TableCell>
                      {row.account ? (
                        <div className="text-sm">
                          <div>
                            {compactNumber(row.account.num_tweets)} tweets
                          </div>
                          <div className="text-xs text-muted-foreground">
                            via {row.account.created_via}
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          No matching all_account row
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(row.updated_at)}
                    </TableCell>
                    <TableCell>
                      <OptInActions
                        record={row}
                        accountId={row.account?.account_id}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {!data.optInRows.length ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-sm text-muted-foreground"
                    >
                      No opt-in table rows found.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Accounts with data</CardTitle>
            <CardDescription>
              Includes accounts present in archive-derived tables, including
              accounts that may only appear through replies, quotes, retweets,
              or other context. Context-only accounts can be scrape-blocked
              without creating an opt-in row.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Opt-in state</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Scrape blocklist</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.accountRows.map((row) => (
                  <TableRow key={row.account_id}>
                    <TableCell>
                      <div className="font-medium">@{row.username}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.account_display_name || 'No display name'} ·{' '}
                        {row.account_id}
                      </div>
                    </TableCell>
                    <TableCell>
                      <OptInStatusBadge record={row.optInRecord} />
                    </TableCell>
                    <TableCell>
                      <div>{compactNumber(row.num_tweets)} tweets</div>
                      <div className="text-xs text-muted-foreground">
                        {row.archiveUploadCount} direct uploads · via{' '}
                        {row.created_via}
                      </div>
                    </TableCell>
                    <TableCell>
                      {row.blockedFromScraping ? (
                        <Badge variant="destructive">Blocked</Badge>
                      ) : (
                        <Badge variant="outline">Allowed</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(row.updated_at)}
                    </TableCell>
                    <TableCell>
                      <div className="min-w-72 flex flex-col gap-3">
                        <ScrapeBlockAction
                          accountId={row.account_id}
                          blocked={row.blockedFromScraping}
                        />
                        {row.optInRecord ? (
                          <OptInActions
                            record={row.optInRecord}
                            accountId={row.account_id}
                          />
                        ) : (
                          <p className="max-w-xs text-xs text-muted-foreground">
                            No auth-linked opt-in row exists for this account.
                            Use scrape blocklist for now; creating durable
                            admin-managed opt-outs needs a schema decision.
                          </p>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!data.accountRows.length ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center text-sm text-muted-foreground"
                    >
                      No accounts found.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
