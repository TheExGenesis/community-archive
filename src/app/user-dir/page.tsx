'use client'
import { useEffect, useState } from 'react'
import { User, SortKey } from '@/lib-client/types'
import { fetchUsers } from '@/lib-server/queries/fetchUsers'
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
import { formatNumber } from '@/lib-client/formatNumber'
import { createBrowserClient } from '@/utils/supabase'

export default function UserDirectoryPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('archive_uploaded_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const supabase = createBrowserClient()
        const sortedUsers = await fetchUsers(supabase)
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

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error}</div>

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
    <div className="relative mx-auto w-full max-w-6xl bg-white p-24 dark:bg-gray-800">
      <h2 className="mb-6 text-3xl font-bold">User Directory</h2>
      <div className="w-full overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Avatar</TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  onClick={() => sortData('account_display_name')}
                >
                  Display Name {renderSortIcon('account_display_name')}
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" onClick={() => sortData('username')}>
                  Username {renderSortIcon('username')}
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" onClick={() => sortData('num_tweets')}>
                  Tweets {renderSortIcon('num_tweets')}
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" onClick={() => sortData('num_likes')}>
                  Likes {renderSortIcon('num_likes')}
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  onClick={() => sortData('num_followers')}
                >
                  Followers {renderSortIcon('num_followers')}
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" onClick={() => sortData('archive_at')}>
                  Archive Date {renderSortIcon('archive_at')}
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" onClick={() => sortData('created_at')}>
                  Account Created At {renderSortIcon('created_at')}
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  onClick={() => sortData('archive_uploaded_at')}
                >
                  Archive Uploaded At {renderSortIcon('archive_uploaded_at')}
                </Button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.account_id}>
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

                <TableCell>
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
                    {user.username}
                  </Link>
                </TableCell>
                <TableCell>{formatNumber(user.num_tweets)}</TableCell>
                <TableCell>{formatNumber(user.num_likes)}</TableCell>
                <TableCell>{formatNumber(user.num_followers)}</TableCell>
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
  )
}
