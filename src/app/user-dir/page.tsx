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
}
type SortKey = 'username' | 'created_at' | 'account_display_name' | 'archive_at'

export default function UserDirectoryPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('archive_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const supabase = createBrowserClient()

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const { data, error } = await supabase
          .from('account')
          .select(
            `
            account_id,
            username,
            account_display_name,
            created_at,
            profile:profile(bio, website, location, avatar_media_url),
            archive_upload:archive_upload(archive_at)
          `,
          )
          .order('created_at', { ascending: false })

        if (error) throw error
        const formattedUsers: any = data.map((user) => ({
          ...user,
          bio: Array.isArray(user.profile)
            ? user.profile[user.profile.length - 1]?.bio || null
            : user.profile?.bio || null,
          website: Array.isArray(user.profile)
            ? user.profile[user.profile.length - 1]?.website || null
            : user.profile?.website || null,
          location: Array.isArray(user.profile)
            ? user.profile[user.profile.length - 1]?.location || null
            : user.profile?.website || null,
          avatar_media_url: Array.isArray(user.profile)
            ? user.profile[user.profile.length - 1]?.avatar_media_url || null
            : user.profile?.avatar_media_url || null,
          archive_at: Array.isArray(user.archive_upload)
            ? user.archive_upload[user.archive_upload.length - 1]?.archive_at ||
              null
            : user.archive_upload?.archive_at || null,
        }))

        const sortedUsers = formattedUsers.sort((a, b) => {
          if (!a.archive_at) return 1
          if (!b.archive_at) return -1
          return (
            new Date(b.archive_at).getTime() - new Date(a.archive_at).getTime()
          )
        })

        setUsers(formattedUsers)
      } catch (error) {
        setError('Failed to fetch users')
        console.error('Error fetching users:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchUsers()
  }, [supabase])

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error}</div>

  const sortData = (key: SortKey) => {
    const newData = [...users].sort((a, b) => {
      if (a[key] < b[key]) return sortOrder === 'asc' ? -1 : 1
      if (a[key] > b[key]) return sortOrder === 'asc' ? 1 : -1
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
    <div className="flex w-full flex-1 flex-col items-center gap-20">
      <nav className="flex h-16 w-full justify-center border-b border-b-foreground/10">
        <div className="flex w-full max-w-4xl items-center justify-between p-3 text-sm"></div>
      </nav>

      <div className="flex max-w-6xl flex-1 flex-col gap-20 px-3">
        <main className="flex flex-1 flex-col gap-6">
          <h2 className="mb-4 text-4xl font-bold">User Directory</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Avatar</TableHead>
                <TableHead>
                  <Button variant="ghost" onClick={() => sortData('username')}>
                    Username {renderSortIcon('username')}
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    onClick={() => sortData('account_display_name')}
                  >
                    Display Name {renderSortIcon('account_display_name')}
                  </Button>
                </TableHead>

                {/* <TableHead>Bio</TableHead>
                <TableHead>Website</TableHead> */}
                {/* <TableHead>Location</TableHead> */}
                <TableHead>
                  <Button
                    variant="ghost"
                    onClick={() => sortData('created_at')}
                  >
                    Created At {renderSortIcon('created_at')}
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    onClick={() => sortData('archive_at')}
                  >
                    Archive Date {renderSortIcon('archive_at')}
                  </Button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.account_id}>
                  <TableCell>
                    <Link href={`/user/${user.account_id}`}>
                      <img
                        src={user.avatar_media_url}
                        width={48}
                        height={48}
                        className="mr-3 rounded-full"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement
                          target.onerror = null // Prevent infinite loop
                          target.src =
                            'https://fabxmporizzqflnftavs.supabase.co/storage/v1/object/public/assets/placeholder.jpg?t=2024-09-09T21%3A51%3A06.677Z'
                        }}
                      />
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/user/${user.account_id}`}
                      className=" hover:underline"
                    >
                      {user.username}
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

                  {/* <TableCell>{user.bio || '-'}</TableCell>
                  <TableCell>{user.website || '-'}</TableCell> */}
                  {/* <TableCell>{user.location || '-'}</TableCell> */}
                  <TableCell>
                    {new Date(user.created_at).toLocaleDateString()}{' '}
                  </TableCell>
                  <TableCell>
                    {user.archive_at
                      ? new Date(user.archive_at).toLocaleDateString()
                      : '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </main>
      </div>
      <footer className="w-full justify-center border-t border-t-foreground/10 p-8 text-center text-xs">
        <ThemeToggle />
      </footer>
    </div>
  )
}
