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
import { AdminActionsMenu, type AdminMenuAction } from './AdminActionsMenu'

export const dynamic = 'force-dynamic'

const ADMIN_USERNAME = 'exgenesis'
const PRODUCTION_SUPABASE_HOST = 'fabxmporizzqflnftavs.supabase.co'
const DEFAULT_LIMIT = 50

type OptInRecord = {
  id: string
  user_id: string | null
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

type OptInAdminRow = OptInRecord & {
  account: AccountRecord | null
  blockedFromScraping: boolean
}

type AdminData = {
  optInRows: OptInAdminRow[]
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

const isKnownProductionSupabase = () =>
  process.env.NEXT_PUBLIC_SUPABASE_URL?.includes(PRODUCTION_SUPABASE_HOST) ??
  false

const isStagingAdminAccessEnabled = () =>
  process.env.ENABLE_STAGING_DEV_LOGIN === 'true' &&
  process.env.ALLOW_STAGING_ADMIN_ON_PROD_SUPABASE !== 'true' &&
  !isKnownProductionSupabase()

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

  if (
    getTwitterUsername(user) !== ADMIN_USERNAME &&
    !isStagingAdminAccessEnabled()
  ) {
    notFound()
  }

  return { user, cookieStore }
}

async function getAdminClient() {
  const { cookieStore } = await requireAdmin()
  return createServerAdminClient(cookieStore)
}

const normalizeSearch = (value: string | undefined) =>
  value?.trim().replace(/^@/, '').toLowerCase().slice(0, 80) ?? ''

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
    'id, user_id, username, twitter_user_id, opted_in, explicit_optout, opt_out_reason, updated_at, opted_in_at, opted_out_at'

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
    'id, user_id, username, twitter_user_id, opted_in, explicit_optout, opt_out_reason, updated_at, opted_in_at, opted_out_at'

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
    accountsByIdResponse,
    accountsByUsernameResponse,
  ] = await Promise.all([
    fetchOptInMatches(admin, accountRows),
    fetchArchiveUploadCounts(admin, accountIds),
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
  const adminAccountIds = uniqueBy(
    [
      ...accountIds,
      ...optInAccountIds,
      ...accountsForOptIns.map((account) => account.account_id),
    ].filter(Boolean),
    (accountId) => accountId,
  )
  const scrapeBlocklist = await fetchScrapeBlocklist(admin, adminAccountIds)

  if (scrapeBlocklist.warning) {
    warnings.push(scrapeBlocklist.warning)
  }

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
    optInRows: optInRecords.map((record) => {
      const account =
        (record.twitter_user_id
          ? accountsById.get(record.twitter_user_id)
          : null) ??
        accountsByUsername.get(record.username.toLowerCase()) ??
        null
      const accountId = record.twitter_user_id ?? account?.account_id ?? ''

      return {
        ...record,
        account,
        blockedFromScraping: scrapeBlocklist.blockedAccountIds.has(accountId),
      }
    }),
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

async function deleteScrapeBlock(
  admin: Awaited<ReturnType<typeof getAdminClient>>,
  accountId: string,
) {
  if (!accountId) {
    return
  }

  const tesClient = admin.schema('tes' as never) as any
  const { error } = await tesClient
    .from('blocked_scraping_users')
    .delete()
    .eq('account_id', accountId)

  if (error) {
    throw error
  }
}

async function upsertScrapeBlock(
  admin: Awaited<ReturnType<typeof getAdminClient>>,
  accountId: string,
) {
  if (!accountId) {
    return
  }

  const tesClient = admin.schema('tes' as never) as any
  const { error } = await tesClient
    .from('blocked_scraping_users')
    .upsert({ account_id: accountId }, { onConflict: 'account_id' })

  if (error) {
    throw error
  }
}

async function deleteStorageFiles(
  admin: Awaited<ReturnType<typeof getAdminClient>>,
  username: string,
) {
  const { data: fileList, error: listError } = await admin.storage
    .from('archives')
    .list(username)

  if (listError) {
    throw listError
  }

  if (!fileList?.length) {
    return
  }

  const filesToDelete = fileList.map((file) => `${username}/${file.name}`)
  const { error: deleteError } = await admin.storage
    .from('archives')
    .remove(filesToDelete)

  if (deleteError) {
    throw deleteError
  }
}

async function adminOptOutAccount(formData: FormData) {
  'use server'

  const admin = await getAdminClient()
  const id = String(formData.get('id') ?? '')
  const username = normalizeSearch(String(formData.get('username') ?? ''))
  const twitterUserId = String(formData.get('twitter_user_id') ?? '')
  const reason =
    String(formData.get('reason') ?? '').trim() || 'Admin manual opt-out'
  const deleteData = String(formData.get('delete_data') ?? '') === 'true'

  if (!username) {
    throw new Error('Missing username')
  }

  await upsertScrapeBlock(admin, twitterUserId)

  const optOutUpdate = {
    username,
    twitter_user_id: twitterUserId || null,
    opted_in: false,
    explicit_optout: true,
    opt_out_reason: reason,
  }

  const optOutResponse = id
    ? await admin.from('optin').update(optOutUpdate).eq('id', id)
    : await admin.from('optin').upsert(
        {
          ...optOutUpdate,
          user_id: null,
        },
        { onConflict: 'username' },
      )

  if (optOutResponse.error) {
    throw optOutResponse.error
  }

  if (deleteData) {
    if (!twitterUserId) {
      throw new Error('Missing Twitter account id for delete')
    }

    const deleteResponse = await admin.rpc('delete_user_archive', {
      p_account_id: twitterUserId,
    })

    if (deleteResponse.error) {
      throw deleteResponse.error
    }

    await deleteStorageFiles(admin, username)
  }

  revalidatePath('/admin')
}

async function adminSetOptInState(formData: FormData) {
  'use server'

  const admin = await getAdminClient()
  const id = String(formData.get('id') ?? '')
  const username = normalizeSearch(String(formData.get('username') ?? ''))
  const twitterUserId = String(formData.get('twitter_user_id') ?? '')
  const state = String(formData.get('state') ?? '')

  if (!username) {
    throw new Error('Missing username')
  }

  const update =
    state === 'opted-in'
      ? {
          username,
          twitter_user_id: twitterUserId || null,
          opted_in: true,
          explicit_optout: false,
          opt_out_reason: null,
        }
      : state === 'neutral'
        ? {
            username,
            twitter_user_id: twitterUserId || null,
            opted_in: false,
            explicit_optout: false,
            opt_out_reason: null,
          }
        : null

  if (!update) {
    throw new Error('Unsupported opt-in state')
  }

  const existingResponse = id
    ? null
    : await admin
        .from('optin')
        .select('id')
        .eq('username', username)
        .maybeSingle()

  if (existingResponse?.error) {
    throw existingResponse.error
  }

  const recordId = id || existingResponse?.data?.id
  const response = recordId
    ? await admin.from('optin').update(update).eq('id', recordId)
    : await admin.from('optin').insert({
        ...update,
        user_id: null,
      })

  if (response.error) {
    throw response.error
  }

  if (state === 'opted-in') {
    await deleteScrapeBlock(admin, twitterUserId)
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

function buildAdminActions({
  username,
  twitterUserId,
  optInRecord,
  blockedFromScraping,
}: {
  username: string
  twitterUserId: string
  optInRecord: OptInRecord | null
  blockedFromScraping: boolean
}): AdminMenuAction[] {
  const commonInputs = [
    { name: 'id', value: optInRecord?.id ?? '' },
    { name: 'username', value: username },
    { name: 'twitter_user_id', value: twitterUserId },
  ]

  return [
    {
      id: 'opt-in',
      label: 'Opt in',
      title: `Opt in @${username}?`,
      description:
        'This will create or update a public.optin row and clear any explicit opt-out state.',
      action: adminSetOptInState,
      hiddenInputs: [...commonInputs, { name: 'state', value: 'opted-in' }],
      consequences: [
        'The account will be treated as opted in for archive collection.',
        'Any scrape blocklist entry for this account id will be removed when an id is available.',
      ],
    },
    {
      id: blockedFromScraping ? 'unblock-scraping' : 'block-scraping',
      label: blockedFromScraping ? 'Unblock scraping' : 'Block scraping',
      title: blockedFromScraping
        ? `Unblock scraping for @${username}?`
        : `Block scraping for @${username}?`,
      description: blockedFromScraping
        ? 'This will remove the account id from the scrape blocklist without changing opt-in state.'
        : 'This will add the account id to the scrape blocklist without changing opt-in state.',
      action: setScrapeBlock,
      hiddenInputs: [
        { name: 'account_id', value: twitterUserId },
        { name: 'blocked', value: blockedFromScraping ? 'false' : 'true' },
      ],
      disabled: !twitterUserId,
    },
    {
      id: 'clear',
      label: 'Clear opt-in state',
      title: `Clear opt-in state for @${username}?`,
      description:
        'This keeps the row but marks it neutral: not opted in and not explicitly opted out.',
      action: adminSetOptInState,
      hiddenInputs: [...commonInputs, { name: 'state', value: 'neutral' }],
      consequences: [
        'The account will no longer be opted in.',
        'The account will not be on the explicit opt-out list.',
      ],
    },
    {
      id: 'opt-out',
      label: 'Opt out',
      title: `Opt out @${username}?`,
      description:
        'This will add the account to the explicit opt-out list and block future scraping.',
      action: adminOptOutAccount,
      hiddenInputs: [
        ...commonInputs,
        {
          name: 'reason',
          value: optInRecord?.opt_out_reason ?? 'Admin manual opt-out',
        },
        { name: 'delete_data', value: 'false' },
      ],
      consequences: [
        'The opt-in row will be marked explicitly opted out.',
        'The account id will be added to the scrape blocklist when an id is available.',
        'Existing archive data will stay in place.',
      ],
      separatorBefore: true,
    },
    {
      id: 'opt-out-delete',
      label: 'Opt out and delete data',
      title: `Opt out and delete @${username}?`,
      description:
        'This will opt the account out and permanently delete their existing Community Archive data.',
      action: adminOptOutAccount,
      hiddenInputs: [
        ...commonInputs,
        {
          name: 'reason',
          value: optInRecord?.opt_out_reason ?? 'Admin manual opt-out',
        },
        { name: 'delete_data', value: 'true' },
      ],
      consequences: [
        'The opt-in row will be marked explicitly opted out.',
        'The account id will be added to the scrape blocklist.',
        'All archives, tweets, likes, followers/following, profile rows, and scraper/extension rows for the account id will be deleted.',
        'Archive files under the storage username folder will be removed.',
      ],
      disabled: !twitterUserId,
      destructive: true,
      irreversible: true,
    },
  ]
}

function RowActions({
  username,
  twitterUserId,
  optInRecord,
  blockedFromScraping,
}: {
  username: string
  twitterUserId: string
  optInRecord: OptInRecord | null
  blockedFromScraping: boolean
}) {
  return (
    <AdminActionsMenu
      actions={buildAdminActions({
        username,
        twitterUserId,
        optInRecord,
        blockedFromScraping,
      })}
    />
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
                Visible only to @{ADMIN_USERNAME}, with staging-only dev access
                when enabled. Reads and mutations use the server-side Supabase
                service role after the identity gate passes.
              </p>
            </div>
            <Badge variant="secondary">@{twitterUsername}</Badge>
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
            <CardTitle>Manual opt-in rows</CardTitle>
            <CardDescription>
              Create or update a public.optin row for someone who has not signed
              in. If they later sign in with the same username, their auth user
              claims the row.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto]"
              action={adminSetOptInState}
            >
              <Input name="username" placeholder="username" required />
              <Input name="twitter_user_id" placeholder="Twitter account id" />
              <Button name="state" value="opted-in">
                Opt in
              </Button>
              <Button name="state" value="neutral" variant="outline">
                Create neutral
              </Button>
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
                      <RowActions
                        username={row.username}
                        twitterUserId={
                          row.twitter_user_id ?? row.account?.account_id ?? ''
                        }
                        optInRecord={row}
                        blockedFromScraping={row.blockedFromScraping}
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
                      <RowActions
                        username={row.username}
                        twitterUserId={row.account_id}
                        optInRecord={row.optInRecord}
                        blockedFromScraping={row.blockedFromScraping}
                      />
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
