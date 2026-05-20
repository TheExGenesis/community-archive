'use client'

import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AdminActionsMenu, type AdminMenuAction } from './AdminActionsMenu'
import {
  adminOptOutAccount,
  adminSetOptInState,
  loadMoreAccountsAction,
  searchAccountsAction,
  setScrapeBlock,
} from './actions'
import type { AccountsCursor, MergedRow, OptInRecord } from './data'

const formatDate = (value: string | null) => {
  if (!value) return 'never'
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

const compactNumber = (value: number | null | undefined) =>
  value == null ? 'unknown' : new Intl.NumberFormat('en').format(value)

function OptInStatusBadge({ record }: { record: OptInRecord | null }) {
  if (!record) return <Badge variant="outline">No opt-in row</Badge>
  if (record.explicit_optout) {
    return <Badge variant="destructive">Explicit opt-out</Badge>
  }
  if (record.opted_in) return <Badge>Opted in</Badge>
  return <Badge variant="secondary">Not opted in</Badge>
}

function buildAdminActions(args: {
  username: string
  twitterUserId: string
  optInRecord: OptInRecord | null
  blockedFromScraping: boolean
}): AdminMenuAction[] {
  const { username, twitterUserId, optInRecord, blockedFromScraping } = args
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

type AdminTableProps = {
  initialRows: MergedRow[]
  initialCursor: AccountsCursor | null
  initialSearch: string
  initialOptInCount: number
}

export function AdminTable({
  initialRows,
  initialCursor,
  initialSearch,
  initialOptInCount,
}: AdminTableProps) {
  const [searchInput, setSearchInput] = useState(initialSearch)
  const [activeSearch, setActiveSearch] = useState(initialSearch)
  const [rows, setRows] = useState<MergedRow[]>(initialRows)
  const [cursor, setCursor] = useState<AccountsCursor | null>(initialCursor)
  const [optInCount, setOptInCount] = useState(initialOptInCount)
  const [loadingMore, setLoadingMore] = useState(false)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Debounced server-action search. Doesn't touch the URL or trigger an RSC
  // refetch — we just call a server action and replace the table contents.
  // A monotonically-increasing token lets stale responses get discarded.
  const searchTokenRef = useRef(0)
  useEffect(() => {
    const trimmed = searchInput.trim()
    if (trimmed === activeSearch) return
    const handle = setTimeout(async () => {
      const token = ++searchTokenRef.current
      setSearching(true)
      setError(null)
      try {
        const page = await searchAccountsAction(trimmed)
        if (token !== searchTokenRef.current) return
        setRows(page.rows)
        setCursor(page.nextCursor)
        setOptInCount(page.optInCount)
        setActiveSearch(trimmed)
      } catch (e) {
        if (token !== searchTokenRef.current) return
        setError(e instanceof Error ? e.message : 'Search failed')
      } finally {
        if (token === searchTokenRef.current) setSearching(false)
      }
    }, 300)
    return () => clearTimeout(handle)
  }, [searchInput, activeSearch])

  const accountRowKeys = useMemo(() => {
    const accountIds = new Set<string>()
    const usernames = new Set<string>()
    for (const row of rows) {
      if (row.account?.account_id) accountIds.add(row.account.account_id)
      usernames.add(row.username.toLowerCase())
    }
    return { accountIds, usernames }
  }, [rows])

  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    setError(null)
    try {
      const page = await loadMoreAccountsAction({
        search: activeSearch,
        cursor,
        excludeAccountIds: Array.from(accountRowKeys.accountIds),
        excludeUsernames: Array.from(accountRowKeys.usernames),
      })
      setRows((prev) => [...prev, ...page.rows])
      setCursor(page.nextCursor)
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Failed to load more accounts',
      )
    } finally {
      setLoadingMore(false)
    }
  }, [cursor, loadingMore, activeSearch, accountRowKeys])

  useEffect(() => {
    if (!cursor) return
    const node = sentinelRef.current
    if (!node) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMore()
        }
      },
      { rootMargin: '400px 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [cursor, loadMore])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Search by @username or account id (server-side)"
          className="sm:max-w-md"
        />
        <p className="text-xs text-muted-foreground">
          {searching ? 'Searching… ' : ''}
          {optInCount > 0
            ? `${optInCount} opt-in row${optInCount === 1 ? '' : 's'} pinned at top · `
            : ''}
          {rows.length} loaded
          {cursor ? ' · scroll for more' : ''}
        </p>
      </div>

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
          {rows.map((row) => {
            const accountId =
              row.account?.account_id ??
              row.optInRecord?.twitter_user_id ??
              ''
            const updatedAt =
              row.account?.updated_at ?? row.optInRecord?.updated_at ?? null
            return (
              <TableRow key={row.key}>
                <TableCell>
                  <div className="font-medium">@{row.username}</div>
                  <div className="text-xs text-muted-foreground">
                    {row.account
                      ? `${row.account.account_display_name || 'No display name'} · ${row.account.account_id}`
                      : row.optInRecord?.twitter_user_id
                        ? row.optInRecord.twitter_user_id
                        : 'No matching all_account row'}
                  </div>
                </TableCell>
                <TableCell>
                  <OptInStatusBadge record={row.optInRecord} />
                </TableCell>
                <TableCell>
                  {row.account ? (
                    <div>
                      <div>{compactNumber(row.account.num_tweets)} tweets</div>
                      <div className="text-xs text-muted-foreground">
                        {row.archiveUploadCount} direct uploads · via{' '}
                        {row.account.created_via}
                      </div>
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      No archive data
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  {row.blockedFromScraping ? (
                    <Badge variant="destructive">Blocked</Badge>
                  ) : (
                    <Badge variant="outline">Allowed</Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDate(updatedAt)}
                </TableCell>
                <TableCell>
                  <AdminActionsMenu
                    actions={buildAdminActions({
                      username: row.username,
                      twitterUserId: accountId,
                      optInRecord: row.optInRecord,
                      blockedFromScraping: row.blockedFromScraping,
                    })}
                  />
                </TableCell>
              </TableRow>
            )
          })}
          {!rows.length ? (
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

      {error ? (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-950 dark:border-red-700 dark:bg-red-950/30 dark:text-red-100">
          {error}
        </div>
      ) : null}

      <div ref={sentinelRef} aria-hidden className="h-1" />

      {cursor ? (
        <div className="py-4 text-center text-xs text-muted-foreground">
          {loadingMore ? 'Loading more accounts…' : 'Scroll to load more'}
        </div>
      ) : rows.length ? (
        <div className="py-4 text-center text-xs text-muted-foreground">
          End of results.
        </div>
      ) : null}
    </div>
  )
}
