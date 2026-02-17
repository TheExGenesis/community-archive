'use client'
import { useEffect, useState, useCallback } from 'react'
import { User, SortKey } from '@/lib/types'
import { fetchUsers, fetchUsersCount } from '@/lib/queries/fetchUsers'
import Link from 'next/link'

import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table'
import { ArrowUpDown, Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { formatNumber } from '@/lib/formatNumber'
import { createBrowserClient } from '@/utils/supabase'

const USERS_PER_PAGE = 50

export default function UserDirectoryPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('archive_uploaded_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [totalCount, setTotalCount] = useState<number>(0)
  const [hasMore, setHasMore] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Style definitions copied from homepage
  const unifiedDeepBlueBase = "bg-white dark:bg-background";
  const sectionPaddingClasses = "py-12 md:py-16 lg:py-20"
  // Using max-w-6xl for user directory to accommodate table width
  const contentWrapperClasses = "w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10"

  const supabase = createBrowserClient()

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const loadUsers = useCallback(async (reset: boolean = false) => {
    try {
      if (reset) {
        setLoading(true)
        setUsers([])
      } else {
        setLoadingMore(true)
      }

      const offset = reset ? 0 : users.length
      const fetchedUsers = await fetchUsers(supabase, {
        limit: USERS_PER_PAGE,
        offset,
        sortBy: sortKey,
        sortOrder,
        search: debouncedSearch || undefined
      })

      if (reset) {
        setUsers(fetchedUsers)
      } else {
        setUsers(prev => [...prev, ...fetchedUsers])
      }

      setHasMore(fetchedUsers.length === USERS_PER_PAGE)
    } catch (err) {
      setError('Failed to fetch users')
      console.error('Error fetching users:', err)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [supabase, users.length, sortKey, sortOrder, debouncedSearch])

  // Load initial users and count
  useEffect(() => {
    const init = async () => {
      try {
        const count = await fetchUsersCount(supabase)
        setTotalCount(count)
      } catch (err) {
        console.error('Error fetching count:', err)
      }
      loadUsers(true)
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Reload when sort or search changes
  useEffect(() => {
    const reload = async () => {
      try {
        const count = await fetchUsersCount(supabase, debouncedSearch || undefined)
        setTotalCount(count)
      } catch (err) {
        console.error('Error fetching count:', err)
      }
      loadUsers(true)
    }
    reload()
  }, [sortKey, sortOrder, debouncedSearch]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !searchQuery) return (
    <div className="flex justify-center items-center min-h-screen">
      <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      <p className="text-xl ml-3">Loading users...</p>
    </div>
  )
  if (error) return <div className="flex justify-center items-center min-h-screen"><p className="text-xl text-red-500">Error: {error}</p></div>

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortOrder('desc')
    }
  }

  const renderSortIcon = (key: SortKey) => {
    if (sortKey === key) {
      return (
        <ArrowUpDown
          className={`ml-2 h-4 w-4 ${
            sortOrder === 'desc' ? 'rotate-180 transform' : ''
          }`}
        />
      )
    }
    return <ArrowUpDown className="ml-2 h-4 w-4 opacity-20" />
  }

  return (
    <main>
      <section
        className={`${unifiedDeepBlueBase} ${sectionPaddingClasses} overflow-hidden min-h-screen`}
      >
        <div className={`${contentWrapperClasses}`}>
          <div className="mb-8 text-center">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white">User Directory</h2>
            {totalCount > 0 && (
              <p className="text-gray-600 dark:text-gray-400 mt-2">
                Showing {users.length} of {formatNumber(totalCount)} users
              </p>
            )}
          </div>
          <div className="relative mb-4 max-w-sm mx-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by name or username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="w-full overflow-x-scroll bg-slate-100 dark:bg-card p-6 rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Avatar</TableHead>
                  <TableHead>
                    <Button
                      variant="ghost"
                      onClick={() => handleSort('account_display_name')}
                          className="hover:bg-slate-200 dark:hover:bg-slate-700"
                    >
                      Display Name {renderSortIcon('account_display_name')}
                    </Button>
                  </TableHead>
                  <TableHead>
                        <Button
                          variant="ghost"
                          onClick={() => handleSort('username')}
                          className="hover:bg-slate-200 dark:hover:bg-slate-700"
                        >
                      Username {renderSortIcon('username')}
                    </Button>
                  </TableHead>
                  <TableHead>
                        <Button
                          variant="ghost"
                          onClick={() => handleSort('num_tweets')}
                          className="hover:bg-slate-200 dark:hover:bg-slate-700"
                        >
                      Tweets {renderSortIcon('num_tweets')}
                    </Button>
                  </TableHead>
                  <TableHead>
                        <Button
                          variant="ghost"
                          onClick={() => handleSort('num_likes')}
                          className="hover:bg-slate-200 dark:hover:bg-slate-700"
                        >
                      Likes {renderSortIcon('num_likes')}
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button
                      variant="ghost"
                      onClick={() => handleSort('num_followers')}
                          className="hover:bg-slate-200 dark:hover:bg-slate-700"
                    >
                      Followers {renderSortIcon('num_followers')}
                    </Button>
                  </TableHead>
                  <TableHead>
                        <Button
                          variant="ghost"
                          onClick={() => handleSort('archive_at')}
                          className="hover:bg-slate-200 dark:hover:bg-slate-700"
                        >
                      Archive Date {renderSortIcon('archive_at')}
                    </Button>
                  </TableHead>
                  <TableHead>
                        <Button
                          variant="ghost"
                          onClick={() => handleSort('created_at')}
                          className="hover:bg-slate-200 dark:hover:bg-slate-700"
                        >
                      Account Created At {renderSortIcon('created_at')}
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button
                      variant="ghost"
                      onClick={() => handleSort('archive_uploaded_at')}
                          className="hover:bg-slate-200 dark:hover:bg-slate-700"
                    >
                      Archive Uploaded At {renderSortIcon('archive_uploaded_at')}
                    </Button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                      <TableRow key={user.account_id} className="dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <TableCell>
                      <Link href={`/user/${user.account_id}`}>
                        <Avatar>
                          <AvatarImage
                            src={user.avatar_media_url || '/placeholder.jpg'}
                            alt={`${user.account_display_name}'s avatar`}
                          />
                          <AvatarFallback>
                            {user.account_display_name.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      </Link>
                    </TableCell>
                        <TableCell className="font-medium">
                      <Link
                        href={`/user/${user.account_id}`}
                        className="hover:underline"
                      >
                        {user.account_display_name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/user/${user.account_id}`}
                        className="hover:underline"
                      >
                            @{user.username}
                      </Link>
                    </TableCell>
                        <TableCell className="text-right">{formatNumber(user.num_tweets)}</TableCell>
                        <TableCell className="text-right">{formatNumber(user.num_likes)}</TableCell>
                        <TableCell className="text-right">{formatNumber(user.num_followers)}</TableCell>
                    <TableCell>
                      {user.archive_at
                        ? new Date(user.archive_at).toLocaleDateString()
                        : '-'}
                    </TableCell>
                    <TableCell>
                      {new Date(user.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {user.archive_uploaded_at
                        ? new Date(user.archive_uploaded_at).toLocaleDateString()
                        : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Load More Button */}
          {hasMore && (
            <div className="flex justify-center mt-6">
              <Button
                onClick={() => loadUsers(false)}
                disabled={loadingMore}
                variant="outline"
                size="lg"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  `Load More (${Math.min(USERS_PER_PAGE, totalCount - users.length)} more)`
                )}
              </Button>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
