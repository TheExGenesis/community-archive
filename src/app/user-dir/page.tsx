'use client'
import { useEffect, useState } from 'react'
import { User, SortKey } from '@/lib/types'
import { fetchUsers } from '@/lib/queries/fetchUsers'
import Link from 'next/link'

import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table'
import { ArrowUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { formatNumber } from '@/lib/formatNumber'
import { createBrowserClient } from '@/utils/supabase'

export default function UserDirectoryPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('archive_uploaded_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  // Style definitions copied from homepage
  const unifiedDeepBlueBase = "bg-white dark:bg-background";
  const sectionPaddingClasses = "py-12 md:py-16 lg:py-20"
  // Using max-w-6xl for user directory to accommodate table width
  const contentWrapperClasses = "w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10"

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const supabase = createBrowserClient()
        const users = await fetchUsers(supabase)
        const sortedUsers = [...users].sort((a, b) => {
          const aValue = a.archive_uploaded_at ?? ''
          const bValue = b.archive_uploaded_at ?? ''
          return bValue < aValue ? -1 : bValue > aValue ? 1 : 0
        })
        setUsers(sortedUsers)
      } catch (error) {
        setError('Failed to fetch users')
        console.error('Error fetching users:', error)
      } finally {
        setLoading(false)
      }
    }

    loadUsers()
  }, [])

  if (loading) return <div className="flex justify-center items-center min-h-screen"><p className="text-xl">Loading users...</p></div>
  if (error) return <div className="flex justify-center items-center min-h-screen"><p className="text-xl text-red-500">Error: {error}</p></div>

  const sortData = (key: SortKey) => {
    const newData = [...users].sort((a, b) => {
      const aValue = a[key] ?? ''
      const bValue = b[key] ?? ''
      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1
      return 0
    })
    setUsers(newData)
    if (key === sortKey) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortOrder('asc')
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
          <h2 className="mb-8 text-4xl font-bold text-center text-gray-900 dark:text-white">User Directory</h2>
          <div className="w-full overflow-x-scroll bg-slate-100 dark:bg-card p-6 rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Avatar</TableHead>
                  <TableHead>
                    <Button
                      variant="ghost"
                      onClick={() => sortData('account_display_name')}
                          className="hover:bg-slate-200 dark:hover:bg-slate-700"
                    >
                      Display Name {renderSortIcon('account_display_name')}
                    </Button>
                  </TableHead>
                  <TableHead>
                        <Button 
                          variant="ghost" 
                          onClick={() => sortData('username')} 
                          className="hover:bg-slate-200 dark:hover:bg-slate-700"
                        >
                      Username {renderSortIcon('username')}
                    </Button>
                  </TableHead>
                  <TableHead>
                        <Button 
                          variant="ghost" 
                          onClick={() => sortData('num_tweets')} 
                          className="hover:bg-slate-200 dark:hover:bg-slate-700"
                        >
                      Tweets {renderSortIcon('num_tweets')}
                    </Button>
                  </TableHead>
                  <TableHead>
                        <Button 
                          variant="ghost" 
                          onClick={() => sortData('num_likes')} 
                          className="hover:bg-slate-200 dark:hover:bg-slate-700"
                        >
                      Likes {renderSortIcon('num_likes')}
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button
                      variant="ghost"
                      onClick={() => sortData('num_followers')}
                          className="hover:bg-slate-200 dark:hover:bg-slate-700"
                    >
                      Followers {renderSortIcon('num_followers')}
                    </Button>
                  </TableHead>
                  <TableHead>
                        <Button 
                          variant="ghost" 
                          onClick={() => sortData('archive_at')} 
                          className="hover:bg-slate-200 dark:hover:bg-slate-700"
                        >
                      Archive Date {renderSortIcon('archive_at')}
                    </Button>
                  </TableHead>
                  <TableHead>
                        <Button 
                          variant="ghost" 
                          onClick={() => sortData('created_at')} 
                          className="hover:bg-slate-200 dark:hover:bg-slate-700"
                        >
                      Account Created At {renderSortIcon('created_at')}
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button
                      variant="ghost"
                      onClick={() => sortData('archive_uploaded_at')}
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
        </div>
      </section>
    </main>
  )
}
