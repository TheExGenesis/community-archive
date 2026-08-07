import { Badge } from '@/components/ui/badge'
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
import type {
  ArchiveDeleteStatus,
  RecentPrivacyActivity as RecentPrivacyActivityData,
} from './activity'

const formatDate = (value: string) => {
  if (!value) return 'Unknown'
  return (
    new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'UTC',
    }).format(new Date(value)) + ' UTC'
  )
}

function DeleteStatusBadge({ status }: { status: ArchiveDeleteStatus }) {
  if (status === 'succeeded') return <Badge>Deleted</Badge>
  if (status === 'failed') {
    return <Badge variant="destructive">Failed</Badge>
  }
  if (status === 'processing') {
    return <Badge variant="secondary">Processing</Badge>
  }
  if (status === 'queued') return <Badge variant="outline">Queued</Badge>
  if (status === 'recorded') return <Badge variant="outline">Logged</Badge>
  return <Badge variant="outline">Unknown</Badge>
}

function AccountLabel({
  username,
  accountId,
}: {
  username: string | null
  accountId: string | null
}) {
  return (
    <div>
      <div className="font-medium">
        {username ? `@${username}` : 'Unknown account'}
      </div>
      {accountId ? (
        <div className="text-xs text-muted-foreground">{accountId}</div>
      ) : null}
    </div>
  )
}

export function RecentPrivacyActivity({
  activity,
}: {
  activity: RecentPrivacyActivityData
}) {
  return (
    <section
      className="flex flex-col gap-4"
      aria-labelledby="privacy-activity-heading"
    >
      <div>
        <h2
          id="privacy-activity-heading"
          className="text-xl font-semibold tracking-tight"
        >
          Recent privacy activity
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Latest archive deletion activity and current explicit opt-outs.
        </p>
      </div>

      {activity.warning ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
          {activity.warning}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Archive deletes</CardTitle>
            <CardDescription>
              Admin worker jobs plus client-recorded self-service deletes,
              including queued or failed work.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Delete</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activity.archiveDeletes.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>
                      <AccountLabel
                        username={event.username}
                        accountId={event.accountId}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{event.detail}</div>
                      <div className="text-xs text-muted-foreground">
                        {event.source}
                      </div>
                      {event.reason ? (
                        <div className="mt-1 max-w-xs text-xs text-muted-foreground">
                          {event.reason}
                        </div>
                      ) : null}
                      {event.error ? (
                        <div className="mt-1 max-w-xs text-xs text-red-700 dark:text-red-300">
                          {event.error}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <DeleteStatusBadge status={event.status} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDate(event.activityAt)}
                      {event.activityAt !== event.requestedAt ? (
                        <div className="mt-1">
                          Requested {formatDate(event.requestedAt)}
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
                {!activity.archiveDeletes.length ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center text-sm text-muted-foreground"
                    >
                      No archive deletes recorded yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Explicit opt-outs</CardTitle>
            <CardDescription>
              Accounts currently marked as explicitly opted out, newest first.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Opted out</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activity.optOuts.map((optOut) => (
                  <TableRow key={optOut.id}>
                    <TableCell>
                      <AccountLabel
                        username={optOut.username}
                        accountId={optOut.accountId}
                      />
                    </TableCell>
                    <TableCell className="max-w-xs text-sm text-muted-foreground">
                      {optOut.reason || 'No reason recorded'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDate(optOut.occurredAt)}
                    </TableCell>
                  </TableRow>
                ))}
                {!activity.optOuts.length ? (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="text-center text-sm text-muted-foreground"
                    >
                      No explicit opt-outs recorded yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
