import Link from 'next/link'
import BrowsingSignInPrompt from '@/components/BrowsingSignInPrompt'
import { MembershipStatusIcon } from '@/components/MembershipStatusIcon'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatDirectoryDate as formatJoinedDate } from '@/lib/directoryDate'
import { formatNumber } from '@/lib/formatNumber'
import { getDirectoryProfileHref } from '@/lib/queries/fetchUsers'
import type { DirectoryUser } from '@/lib/types'

/**
 * The signed-out view of /user-dir: the first page of members by followers,
 * without search, sorting, or paging, so it can be rendered once and cached.
 */
export default function GuestUserDirectory({
  users,
}: {
  users: DirectoryUser[] | null
}) {
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
            Most-followed members
          </p>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm dark:border-border dark:bg-card">
          <Table>
            <TableHeader className="bg-muted/50 dark:bg-card">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[48%] py-2 text-xs font-semibold uppercase tracking-wider">
                  User
                </TableHead>
                <TableHead className="hidden w-[20%] py-2 text-right text-xs font-semibold uppercase tracking-wider sm:table-cell">
                  Followers
                </TableHead>
                <TableHead className="hidden w-[22%] py-2 text-right text-xs font-semibold uppercase tracking-wider md:table-cell">
                  Joined
                </TableHead>
                <TableHead className="w-[10%]">
                  <span className="sr-only">Participation</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!users?.length ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="h-40 text-center text-sm text-muted-foreground"
                  >
                    The member list is temporarily unavailable.
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow
                    key={user.directory_id}
                    className="group border-border hover:bg-accent dark:border-border dark:hover:bg-accent"
                  >
                    <TableCell className="py-4">
                      <Link
                        href={getDirectoryProfileHref(user)}
                        className="flex min-w-0 items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 group-hover:[&_div.font-semibold]:underline"
                      >
                        <Avatar className="h-11 w-11 border border-border">
                          <AvatarImage
                            src={user.avatar_media_url || undefined}
                            alt={`${user.account_display_name}'s avatar`}
                          />
                          <AvatarFallback>
                            {Array.from(
                              user.account_display_name,
                            )[0]?.toUpperCase()}
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
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="mt-6">
          <BrowsingSignInPrompt
            title="Log in to browse every member"
            description="Search the directory by name or username and sort members by followers or join date."
            returnTo="/user-dir"
          />
        </div>
      </div>
    </main>
  )
}
