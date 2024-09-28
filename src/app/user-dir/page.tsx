'use client'
import { useEffect, useState } from 'react'
import ThemeToggle from '@/components/ThemeToggle'
import { createBrowserClient } from '@/utils/supabase'
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
import { formatUserData } from '@/lib-client/user-utils'
import { getSchemaName } from '@/lib-client/getTableName'

type User = {
  account_id: string
  username: string
  account_display_name: string
  created_at: string
  bio: string | null
  website: string | null
  location: string | null
  avatar_media_url: string | null
  archive_at: string | null
  num_tweets: number
  num_followers: number
  num_following: number
  num_likes: number
}
type SortKey =
  | 'username'
  | 'created_at'
  | 'account_display_name'
  | 'archive_at'
  | 'num_tweets'
  | 'num_followers'

const fetchUsers = async (supabase: ReturnType<typeof createBrowserClient>) => {
  const { data, error } = await supabase
    .schema(getSchemaName())
    .from('account')
    .select(
      `
      account_id,
      username,
      account_display_name,
      created_at,
      num_tweets,
      num_followers,
      num_following,
      num_likes,
      profile:profile(bio, website, location, avatar_media_url),
      archive_upload:archive_upload(archive_at)
    `,
    )
    .order('created_at', { ascending: false })

  if (error) throw error

  const formattedUsers: User[] = data.map(formatUserData)

  return formattedUsers.sort((a, b) => {
    if (!a.archive_at) return 1
    if (!b.archive_at) return -1
    return new Date(b.archive_at).getTime() - new Date(a.archive_at).getTime()
  })
}

export default function UserDirectoryPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('archive_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const supabase = createBrowserClient()

  useEffect(() => {
    const loadUsers = async () => {
      try {
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
  }, [supabase])

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
                  Created At {renderSortIcon('created_at')}
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
                <TableCell>{user.num_tweets}</TableCell>
                <TableCell>{user.num_followers}</TableCell>
                <TableCell>
                  {user.archive_at
                    ? new Date(user.archive_at).toLocaleDateString()
                    : '-'}
                </TableCell>
                <TableCell>
                  {new Date(user.created_at).toLocaleDateString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
