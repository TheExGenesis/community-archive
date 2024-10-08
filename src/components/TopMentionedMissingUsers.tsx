'use client'

import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Switch } from '@/components/ui/switch'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ScrollArea } from '@/components/ui/scroll-area'
import { createBrowserClient } from '@/utils/supabase'
import { devLog } from '@/lib-client/devLog'

export type MentionedUser = {
  mentioned_user_id: string
  screen_name: string
  mention_count: number
  account_display_name?: string
  avatar_media_url?: string | null
  uploaded?: boolean
}

type Props = {
  users: MentionedUser[]
  showInviteButton?: boolean
  height?: string // Add this line
}

export default function TopMentionedUsers({
  users,
  showInviteButton = false,
  height = '100%', // Add this line with a default value
}: Props) {
  const [showUploaded, setShowUploaded] = useState(true)
  const [enrichedUsers, setEnrichedUsers] = useState<MentionedUser[]>([])
  const supabase = createBrowserClient()

  useEffect(() => {
    const fetchUserData = async () => {
      const usernames = users.map((user) => user.screen_name)

      const { data: accountsData, error } = await supabase
        .from('account')
        .select(
          `
          username,
          account_display_name,
          profile:profile (
            avatar_media_url,
            archive_upload_id
          )
        `,
        )
        .in('username', usernames)

      if (error || !accountsData) {
        console.error('Error fetching account data:', error)
        return
      }

      const accountMap = new Map(
        accountsData.map((account) => [account.username, account]),
      )

      const enrichedUsersData = users.map((user) => {
        const accountData = accountMap.get(user.screen_name)
        if (!accountData) {
          return { ...user, uploaded: false }
        }
        return {
          ...user,
          account_display_name: accountData.account_display_name,
          avatar_media_url: accountData.profile?.sort(
            (a, b) => b.archive_upload_id - a.archive_upload_id,
          )[0]?.avatar_media_url,
          uploaded: true,
        }
      })
      devLog('enrichedUsersData', enrichedUsersData, accountsData)

      setEnrichedUsers(enrichedUsersData)
    }

    fetchUserData()
  }, [users, supabase])

  const filteredUsers = showUploaded
    ? enrichedUsers
    : enrichedUsers.filter((u) => !u.uploaded)

  const getUserLink = (user: MentionedUser) => {
    return user.uploaded
      ? `/user/${user.mentioned_user_id}`
      : `https://twitter.com/${user.screen_name}`
  }

  return (
    <div className="w-full overflow-x-auto">
      <ScrollArea className={height}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead></TableHead>
              <TableHead>Username</TableHead>
              <TableHead>Mention Count</TableHead>
              {showInviteButton && <TableHead>Action</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.map((user) => (
              <TableRow key={user.mentioned_user_id}>
                <TableCell>
                  <Link href={getUserLink(user)}>
                    <Avatar>
                      <AvatarImage
                        key={`avatar-${user.mentioned_user_id}`}
                        src={user.avatar_media_url || '/placeholder.jpg'}
                        alt={`${
                          user.account_display_name || user.screen_name
                        }'s avatar`}
                      />
                      <AvatarFallback
                        key={`fallback-${user.mentioned_user_id}`}
                      >
                        {(user.account_display_name || user.screen_name)
                          .charAt(0)
                          .toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </Link>
                </TableCell>
                <TableCell>
                  <Link
                    key={`link-${user.mentioned_user_id}`}
                    href={getUserLink(user)}
                    target={user.uploaded ? '_self' : '_blank'}
                    rel={user.uploaded ? '' : 'noopener noreferrer'}
                    className="text-blue-500 hover:underline"
                  >
                    @{user.screen_name}
                  </Link>
                  {user.account_display_name && (
                    <div
                      key={`display-name-${user.mentioned_user_id}`}
                      className="text-sm text-gray-500"
                    >
                      {user.account_display_name}
                    </div>
                  )}
                </TableCell>
                <TableCell>{user.mention_count}</TableCell>
                {showInviteButton && (
                  <TableCell>
                    {!user.uploaded && (
                      <a
                        href={`https://twitter.com/intent/tweet?text=@${user.screen_name} I noticed you're mentioned a lot in the community archive and we're missing your tweets!  https://x.com/exgenesis/status/1831686229944885739`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="button-style text-blue-500 hover:text-blue-600 hover:underline"
                      >
                        Invite
                      </a>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  )
}
