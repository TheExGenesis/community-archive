'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUp, ArrowUpDown, Loader2, Search } from 'lucide-react'

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
import { MembershipStatusIcon } from '@/components/MembershipStatusIcon'
import { formatNumber } from '@/lib/formatNumber'
import { fetchUsers, getDirectoryProfileHref } from '@/lib/queries/fetchUsers'
import { DirectoryUser, SortKey } from '@/lib/types'

export const USERS_PER_PAGE = 15

const joinedDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

function formatJoinedDate(date: string | null) {
  if (!date) return '—'
  return joinedDateFormatter.format(new Date(date))
}

interface UserDirectoryClientProps {
  totalCount: number | null
  initialUsers: DirectoryUser[] | null
  initialHasMore: boolean
}

export default function UserDirectoryClient({
  totalCount,
  initialUsers,
  initialHasMore,
}: UserDirectoryClientProps) {
  const [users, setUsers] = useState<DirectoryUser[]>(initialUsers ?? [])
  const [loading, setLoading] = useState(initialUsers === null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('num_followers')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const loadMoreTargetRef = useRef<HTMLDivElement>(null)
  const loadMoreInFlightRef = useRef(false)
  const requestVersionRef = useRef(0)
  const skipInitialRequestRef = useRef(initialUsers !== null)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => {
    if (skipInitialRequestRef.current) {
      skipInitialRequestRef.current = false
      return
    }
    let isCurrentRequest = true
    const requestVersion = ++requestVersionRef.current

    const reload = async () => {
      setLoading(true)
      setError(null)

      try {
        const search = debouncedSearch || undefined
        const page = await fetchUsers({
          limit: USERS_PER_PAGE,
          offset: 0,
          sortBy: sortKey,
          sortOrder,
          search,
        })

        if (!isCurrentRequest || requestVersion !== requestVersionRef.current)
          return
        setUsers(page.users)
        setHasMore(page.hasMore)
      } catch (err) {
        if (!isCurrentRequest) return
        setError('We could not load users. Please try again.')
        console.error('Error fetching users:', err)
      } finally {
        if (isCurrentRequest) setLoading(false)
      }
    }

    reload()
    return () => {
      isCurrentRequest = false
    }
  }, [debouncedSearch, sortKey, sortOrder])

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || !hasMore || loadMoreInFlightRef.current) {
      return
    }

    const requestVersion = requestVersionRef.current
    loadMoreInFlightRef.current = true
    setLoadingMore(true)
    setError(null)

    try {
      const page = await fetchUsers({
        limit: USERS_PER_PAGE,
        offset: users.length,
        sortBy: sortKey,
        sortOrder,
        search: debouncedSearch || undefined,
      })
      if (requestVersion !== requestVersionRef.current) return

      setUsers((currentUsers) => [...currentUsers, ...page.users])
      setHasMore(page.hasMore)
    } catch (err) {
      if (requestVersion !== requestVersionRef.current) return
      setError('We could not load more members. Please try again.')
      console.error('Error fetching more users:', err)
    } finally {
      loadMoreInFlightRef.current = false
      setLoadingMore(false)
    }
  }, [
    debouncedSearch,
    hasMore,
    loading,
    loadingMore,
    sortKey,
    sortOrder,
    users.length,
  ])

  useEffect(() => {
    const target = loadMoreTargetRef.current
    if (!target || loading || loadingMore || !hasMore || error) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void loadMore()
      },
      { rootMargin: '300px 0px' },
    )

    observer.observe(target)
    return () => observer.disconnect()
  }, [error, hasMore, loadMore, loading, loadingMore])

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortOrder((current) => (current === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortOrder(
        key === 'num_followers' || key === 'joined_at' ? 'desc' : 'asc',
      )
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
            Users
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            Meet the people preserving and participating in the Community
            Archive.
          </p>
          <p className="mt-2 text-sm font-medium text-muted-foreground">
            {loading && users.length === 0
              ? 'Loading users…'
              : debouncedSearch
                ? `${users.length}${hasMore ? '+' : ''} matching users`
                : totalCount === null
                  ? `${users.length}${hasMore ? '+' : ''} users`
                  : `${users.length} of ${totalCount.toLocaleString()} users`}
          </p>
        </div>

        <div className="relative mx-auto mb-6 max-w-xl">
          <Search
            aria-hidden="true"
            className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Search users"
            placeholder="Search by name or username…"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="h-12 rounded-lg border-border bg-card pl-11 shadow-sm dark:border-border dark:bg-background"
          />
        </div>

        <div
          className="overflow-hidden rounded-lg border border-border bg-card shadow-sm dark:border-border dark:bg-card"
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
                    aria-label="Sort by user name"
                    className="-ml-3 h-8 px-3 text-xs font-semibold uppercase tracking-wider hover:bg-accent"
                  >
                    User {renderSortIcon('account_display_name')}
                  </Button>
                </TableHead>
                <TableHead
                  className="hidden w-[20%] py-2 text-right sm:table-cell"
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
                  className="hidden w-[22%] py-2 text-right md:table-cell"
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
                      Loading users…
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
                    No users match “{debouncedSearch}”.
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => {
                  const identity = (
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar className="h-11 w-11 border border-border">
                        <AvatarImage
                          src={user.avatar_media_url || undefined}
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
                      <TableCell className="hidden whitespace-nowrap text-right text-sm font-medium tabular-nums text-muted-foreground sm:table-cell">
                        {user.num_followers == null
                          ? '—'
                          : formatNumber(user.num_followers)}
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap text-right text-sm font-medium text-muted-foreground md:table-cell">
                        <time dateTime={user.joined_at || undefined}>
                          {formatJoinedDate(user.joined_at)}
                        </time>
                      </TableCell>
                      <TableCell className="pr-4">
                        <div className="flex justify-end gap-0.5">
                          <MembershipStatusIcon
                            hasArchive={user.has_archive}
                            isOptedIn={user.is_opted_in}
                          />
                        </div>
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

        {!loading && hasMore && (
          <div ref={loadMoreTargetRef} className="mt-6 flex justify-center">
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
                'Load more users'
              )}
            </Button>
          </div>
        )}
      </div>
    </main>
  )
}
