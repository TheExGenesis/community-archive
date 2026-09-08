import Link from 'next/link'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { userProfileHref } from '@/lib/navigation'
import type { RecentOptInsData } from './recentOptInsData'

function date(value: string | null) {
  if (!value) return 'Unknown'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime())
    ? 'Unknown'
    : parsed.toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
}

export function RecentOptIns({ optIns, failed }: RecentOptInsData) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent opt-ins</CardTitle>
        <CardDescription>
          The latest 20 current opt-ins. Earlier records without an opt-in date
          use their creation date. Explicit opt-outs are excluded.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {failed ? (
          <p role="alert">
            Recent opt-ins could not be loaded. Refresh to try again.
          </p>
        ) : optIns.length === 0 ? (
          <p>No current opt-ins yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Opted in (UTC)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {optIns.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link
                      href={userProfileHref(row.username, row.twitter_user_id)}
                    >
                      @{row.username}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {date(row.opted_in_at ?? row.created_at)}
                    {!row.opted_in_at && row.created_at
                      ? ' (record created)'
                      : ''}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
