'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Archive,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Loader2,
  Radio,
  Search,
} from 'lucide-react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatNumber } from '@/lib/formatNumber'
import {
  fetchUsers,
  fetchUsersCount,
  getDirectoryProfileHref,
} from '@/lib/queries/fetchUsers'
import { DirectoryUser, SortKey } from '@/lib/types'
import { createBrowserClient } from '@/utils/supabase'

const USERS_PER_PAGE = 50

const joinedDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

function formatJoinedDate(date: string | null) {
  if (!date) return '—'
  return joinedDateFormatter.format(new Date(date))
}

export default function UserDirectoryPage() {
  const supabase = useMemo(() => createBrowserClient(), [])
  const [users, setUsers] = useState<DirectoryUser[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('joined_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [totalCount, setTotalCount] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => {
    let isCurrentRequest = true

    const reload = async () => {
      setLoading(true)
      setError(null)

      try {
        const search = debouncedSearch || undefined
        const [count, fetchedUsers] = await Promise.all([
          fetchUsersCount(supabase, search),
          fetchUsers(supabase, {
            limit: USERS_PER_PAGE,
            offset: 0,
            sortBy: sortKey,
            sortOrder,
            search,
          }),
        ])

        if (!isCurrentRequest) return
        setTotalCount(count)
        setUsers(fetchedUsers)
      } catch (err) {
        if (!isCurrentRequest) return
        setError('We could not load the directory. Please try again.')
        console.error('Error fetching users:', err)
      } finally {
        if (isCurrentRequest) setLoading(false)
      }
    }

    reload()
    return () => {
      isCurrentRequest = false
    }
  }, [debouncedSearch, sortKey, sortOrder, supabase])

  const loadMore = async () => {
    setLoadingMore(true)
    setError(null)

    try {
      const fetchedUsers = await fetchUsers(supabase, {
        limit: USERS_PER_PAGE,
        offset: users.length,
        sortBy: sortKey,
        sortOrder,
        search: debouncedSearch || undefined,
      })
      setUsers((currentUsers) => [...currentUsers, ...fetchedUsers])
    } catch (err) {
      setError('We could not load more members. Please try again.')
      console.error('Error fetching more users:', err)
    } finally {
      setLoadingMore(false)
    }
  }

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortOrder((current) => (current === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortOrder(key === 'num_followers' ? 'desc' : 'asc')
    }
  }

  const renderSortIcon = (key: SortKey) => {
    const SortIcon =
      sortKey !== key ? ArrowUpDown : sortOrder === 'asc' ? ArrowUp : ArrowDown

    return (
      <SortIcon
        aria-hidden="true"
        className={`ml-2 h-3.5 w-3.5 transition-opacity ${
          sortKey === key ? 'opacity-70' : 'opacity-25'
        }`}
      />
    )
  }

  return (
    <main className="min-h-screen bg-card py-12 dark:bg-background md:py-16">
      <div className="relative mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            User Directory
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            People preserving and participating in the Community Archive.
          </p>
          <p className="mt-2 text-sm font-medium text-muted-foreground">
            {loading && users.length === 0
              ? 'Loading members…'
              : `${users.length} of ${totalCount.toLocaleString()} members`}
          </p>
        </div>

        <div className="relative mx-auto mb-6 max-w-xl">
          <Search
            aria-hidden="true"
            className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Search the user directory"
            placeholder="Search by name or username…"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="h-12 rounded-xl border-border bg-card pl-11 shadow-sm dark:border-border dark:bg-background"
          />
        </div>

        <div
          className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm dark:border-border dark:bg-card"
          aria-busy={loading}
        >
          <Table>
            <TableHeader className="bg-muted/50 dark:bg-card">
              <TableRow className="hover:bg-transparent">
                <TableHead
                  className="w-[48%] py-2"
                  aria-sort={
                    sortKey === 'account_display_name'
                      ? sortOrder === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  <Button
                    variant="ghost"
                    onClick={() => handleSort('account_display_name')}
                    aria-label="Sort by member name"
                    className="-ml-3 h-8 px-3 text-xs font-semibold uppercase tracking-wider hover:bg-accent"
                  >
                    Member {renderSortIcon('account_display_name')}
                  </Button>
                </TableHead>
                <TableHead
                  className="w-[20%] py-2 text-right"
                  aria-sort={
                    sortKey === 'num_followers'
                      ? sortOrder === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  <Button
                    variant="ghost"
                    onClick={() => handleSort('num_followers')}
                    aria-label="Sort by follower count"
                    className="-mr-3 h-8 px-3 text-xs font-semibold uppercase tracking-wider hover:bg-accent"
                  >
                    Followers {renderSortIcon('num_followers')}
                  </Button>
                </TableHead>
                <TableHead
                  className="w-[22%] py-2 text-right"
                  aria-sort={
                    sortKey === 'joined_at'
                      ? sortOrder === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  <Button
                    variant="ghost"
                    onClick={() => handleSort('joined_at')}
                    aria-label="Sort by join date"
                    className="-mr-3 h-8 px-3 text-xs font-semibold uppercase tracking-wider hover:bg-accent"
                  >
                    Joined {renderSortIcon('joined_at')}
                  </Button>
                </TableHead>
                <TableHead className="w-[10%]">
                  <span className="sr-only">Participation</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-40 text-center">
                    <span className="inline-flex items-center text-sm text-muted-foreground">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading members…
                    </span>
                  </TableCell>
                </TableRow>
              ) : error && users.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="h-40 text-center text-sm text-red-600 dark:text-red-400"
                  >
                    {error}
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="h-40 text-center text-sm text-muted-foreground"
                  >
                    No members match “{debouncedSearch}”.
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => {
                  const identity = (
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar className="h-11 w-11 border border-border">
                        <AvatarImage
                          src={user.avatar_media_url || '/placeholder.jpg'}
                          alt={`${user.account_display_name}'s avatar`}
                        />
                        <AvatarFallback>
                          {user.account_display_name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-foreground">
                          {user.account_display_name}
                        </div>
                        <div className="truncate text-sm text-muted-foreground">
                          @{user.username}
                        </div>
                      </div>
                    </div>
                  )

                  return (
                    <TableRow
                      key={user.directory_id}
                      className="group border-border hover:bg-accent dark:border-border dark:hover:bg-accent"
                    >
                      <TableCell className="py-4">
                        <Link
                          href={getDirectoryProfileHref(user)}
                          className="block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 group-hover:[&_div.font-semibold]:underline"
                        >
                          {identity}
                        </Link>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right text-sm font-medium tabular-nums text-muted-foreground">
                        {user.num_followers == null
                          ? '—'
                          : formatNumber(user.num_followers)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right text-sm font-medium text-muted-foreground">
                        <time dateTime={user.joined_at || undefined}>
                          {formatJoinedDate(user.joined_at)}
                        </time>
                      </TableCell>
                      <TableCell className="pr-4">
                        <TooltipProvider delayDuration={150}>
                          <div className="flex justify-end gap-1">
                            {user.has_archive && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span
                                    role="img"
                                    tabIndex={0}
                                    aria-label="Archive"
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-brand outline-none transition-colors hover:bg-brand/10 hover:text-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 dark:focus-visible:ring-offset-background"
                                  >
                                    <Archive
                                      aria-hidden="true"
                                      className="h-4 w-4"
                                    />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  Archive
                                </TooltipContent>
                              </Tooltip>
                            )}
                            {user.is_opted_in && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span
                                    role="img"
                                    tabIndex={0}
                                    aria-label="Opted in"
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-emerald-500 outline-none transition-colors hover:bg-emerald-50 hover:text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:text-emerald-400 dark:hover:bg-emerald-950/60 dark:hover:text-emerald-300 dark:focus-visible:ring-offset-background"
                                  >
                                    <Radio
                                      aria-hidden="true"
                                      className="h-4 w-4"
                                    />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  Opted in
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </TooltipProvider>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        {error && users.length > 0 && (
          <p className="mt-4 text-center text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        {!loading && users.length < totalCount && (
          <div className="mt-6 flex justify-center">
            <Button
              onClick={loadMore}
              disabled={loadingMore}
              variant="outline"
              size="lg"
              className="rounded-full px-6"
            >
              {loadingMore ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading…
                </>
              ) : (
                `Load ${Math.min(USERS_PER_PAGE, totalCount - users.length)} more`
              )}
            </Button>
          </div>
        )}
      </div>
    </main>
  )
}
