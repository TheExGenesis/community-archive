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
import type { RecentArchiveUploadsData } from './recentUploads'

function date(value: string | null) {
  if (!value) return 'Unknown'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime())
    ? 'Unknown'
    : parsed.toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
}

export function RecentArchiveUploads({
  uploads,
  failed,
}: RecentArchiveUploadsData) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent archive uploads</CardTitle>
        <CardDescription>
          The latest 20 archive processing records, including repeat uploads by
          existing members. Each upload is listed separately.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {failed ? (
          <p role="alert">
            Recent uploads could not be loaded. Refresh to try again.
          </p>
        ) : uploads.length === 0 ? (
          <p>No archive uploads yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Upload</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Received</TableHead>
                <TableHead>Archive date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {uploads.map((upload) => (
                <TableRow key={upload.id}>
                  <TableCell>#{upload.id}</TableCell>
                  <TableCell>
                    <Link
                      href={userProfileHref(upload.username, upload.account_id)}
                    >
                      {upload.username
                        ? `@${upload.username}`
                        : upload.account_id}
                    </Link>
                  </TableCell>
                  <TableCell>{date(upload.created_at)}</TableCell>
                  <TableCell>{date(upload.archive_at)}</TableCell>
                  <TableCell>
                    {upload.upload_phase?.replaceAll('_', ' ') ?? 'Unknown'}
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
