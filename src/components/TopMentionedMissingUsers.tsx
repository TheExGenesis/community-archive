import Link from 'next/link'
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'

export type MentionedUser = {
  mentioned_user_id: string
  name?: string
  screen_name: string
  mention_count: number
  account_display_name?: string
  avatar_media_url?: string | null
  uploaded?: boolean
}

type Props = {
  users: MentionedUser[]
  title: string
  description: string
  showInviteButton?: boolean
}

export default function TopMentionedUsers({
  users,
  showInviteButton = false,
}: Props) {
  return (
    <div className="w-full overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Avatar</TableHead>
            <TableHead>Username</TableHead>
            <TableHead>Mention Count</TableHead>
            {showInviteButton && <TableHead>Action</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.mentioned_user_id}>
              <TableCell>
                <Avatar>
                  <AvatarImage
                    src={user.avatar_media_url || '/placeholder.jpg'}
                    alt={`${
                      user.account_display_name || user.screen_name
                    }'s avatar`}
                  />
                  <AvatarFallback>
                    {(user.account_display_name || user.screen_name)
                      .charAt(0)
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </TableCell>
              <TableCell>
                <Link
                  href={`https://twitter.com/${user.screen_name}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline"
                >
                  @{user.screen_name}
                </Link>
                {user.account_display_name && (
                  <div className="text-sm text-gray-500">
                    {user.account_display_name}
                  </div>
                )}
              </TableCell>
              <TableCell>{user.mention_count}</TableCell>
              {
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
              }
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
