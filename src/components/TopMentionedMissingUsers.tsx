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
import { devLog } from '@/lib/devLog'
import { Label } from '@/components/ui/label'
import { formatNumber } from '@/lib/formatNumber'

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
  showUploadedDefault?: boolean
  showUploadedSwitch?: boolean
  height?: string // Add this line
}

export default function TopMentionedUsers({
  users,
  showUploadedDefault = true,
  showUploadedSwitch = false,
  height = '100%', // Add this line with a default value
}: Props) {
  const [showUploaded, setShowUploaded] = useState(showUploadedDefault)
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
        const media_url = accountData.profile?.avatar_media_url
          ? accountData.profile.avatar_media_url
          : undefined
        return {
          ...user,
          account_display_name: accountData.account_display_name!,
          avatar_media_url: media_url,
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
      {showUploadedSwitch && (
        <div className="mb-4 flex items-center space-x-2">
          <Switch
            id="show-uploaded"
            checked={showUploaded}
            onCheckedChange={setShowUploaded}
          />
          <Label htmlFor="show-uploaded">Show uploaded users</Label>
        </div>
      )}
      <ScrollArea className={height}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead></TableHead>
              <TableHead>Username</TableHead>
              <TableHead>Mention Count</TableHead>
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
                    className=""
                  >
                    <span className="hover:underline">
                      {user.account_display_name || `@${user.screen_name}`}
                    </span>
                    {user.account_display_name && (
                      <div
                        key={`screen-name-${user.mentioned_user_id}`}
                        className="text-sm text-gray-500"
                      >
                        @{user.screen_name}
                      </div>
                    )}
                  </Link>
                </TableCell>
                <TableCell>{formatNumber(user.mention_count)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  )
}
