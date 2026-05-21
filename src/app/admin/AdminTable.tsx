'use client'

import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Loader2, Search } from 'lucide-react'
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
  type AdminActionResult,
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
}): AdminMenuAction[] {
  const { username, twitterUserId, optInRecord } = args
  const commonInputs = [
    { name: 'id', value: optInRecord?.id ?? '' },
    { name: 'username', value: username },
    { name: 'twitter_user_id', value: twitterUserId },
  ]

  // Opt out already adds the account to the scrape blocklist, and opt in
  // already removes it. There's no standalone block/unblock-scraping action —
  // it folds into the opt-in/opt-out lifecycle.
  return [
    {
      id: 'opt-in',
      label: 'Opt in',
      title: `Opt in @${username}?`,
      description:
        'Mark the account as opted in for archive collection and remove any scrape blocklist entry.',
      action: adminSetOptInState,
      hiddenInputs: [...commonInputs, { name: 'state', value: 'opted-in' }],
      consequences: [
        'The account will be treated as opted in for archive collection.',
        'Any scrape blocklist entry for this account id will be removed when an id is available.',
      ],
    },
    {
      id: 'clear',
      label: 'Clear opt-in state',
      title: `Clear opt-in state for @${username}?`,
      description:
        'Mark the row neutral: not opted in and not explicitly opted out.',
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
        'Add the account to the explicit opt-out list and block future scraping.',
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
        'Opt the account out and permanently delete their existing Community Archive data.',
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
        if (!page) {
          setError('Search failed (no data returned)')
          return
        }
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

  // Patches the row matching the action's updated optInRecord in place.
  // Matching: same optInRecord.id (existing row) OR same username (newly
  // created opt-in row, no prior id). archiveDeleted nulls out the account
  // and zeroes the upload count without removing the row. Optimistic refetch
  // intentionally avoided — it was the source of "Cannot read properties of
  // undefined (reading 'rows')" when the searchAccountsAction resolved to
  // undefined (server action redirect race).
  const applyActionResult = useCallback((result: AdminActionResult) => {
    if (!result.ok) return
    const updated = result.optInRecord
    setRows((prev) => {
      let matched = false
      const next = prev.map((row) => {
        const sameRow =
          row.optInRecord?.id === updated.id ||
          row.username.toLowerCase() === updated.username.toLowerCase()
        if (!sameRow) return row
        matched = true
        return {
          ...row,
          optInRecord: updated,
          blockedFromScraping: result.blockedFromScraping,
          account: result.archiveDeleted ? null : row.account,
          archiveUploadCount: result.archiveDeleted
            ? 0
            : row.archiveUploadCount,
        }
      })
      if (matched) return next
      // The action created a brand-new opt-in row that wasn't yet shown
      // (e.g. account-only row that hasn't been merged). Prepend it.
      return [
        {
          key: `optin:${updated.id}`,
          username: updated.username,
          account: null,
          archiveUploadCount: 0,
          blockedFromScraping: result.blockedFromScraping,
          optInRecord: updated,
          fromOptIn: true,
        },
        ...prev,
      ]
    })
    setOptInCount((prev) => prev) // count is informational; keep as is
  }, [])

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
      if (!page) {
        setError('Failed to load more accounts (no data returned)')
        return
      }
      setRows((prev) => [...prev, ...page.rows])
      setCursor(page.nextCursor)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load more accounts')
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
        <div className="relative sm:max-w-md sm:flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          {searching ? (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : null}
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search by @username or account id"
            className="pl-9"
          />
        </div>
        <p className="text-xs text-muted-foreground">
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
              row.account?.account_id ?? row.optInRecord?.twitter_user_id ?? ''
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
                    })}
                    onActionComplete={applyActionResult}
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
