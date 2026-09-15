import Link from 'next/link'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  DIGEST_SUBSCRIBERS_PAGE_SIZE,
  loadDigestSubscribers,
} from './digestSubscribersData'

export async function DigestSubscribersSection({
  page = 1,
  search = '',
}: {
  page?: number
  search?: string
}) {
  let result
  try {
    result = await loadDigestSubscribers(page)
  } catch {
    return (
      <Card id="digest-subscribers">
        <CardHeader>
          <CardTitle>Daily digest mailing list</CardTitle>
        </CardHeader>
        <CardContent>
          <p role="alert">
            Subscribers could not be loaded. Refresh to try again.
          </p>
        </CardContent>
      </Card>
    )
  }
  const { rows, total, page: currentPage } = result
  const offset = (currentPage - 1) * DIGEST_SUBSCRIBERS_PAGE_SIZE
  const pageUrl = (target: number) => {
    const params = new URLSearchParams({ subscriberPage: String(target) })
    if (search) params.set('q', search)
    return `/admin?${params}#digest-subscribers`
  }
  return (
    <Card id="digest-subscribers">
      <CardHeader>
        <CardTitle>Daily digest mailing list</CardTitle>
        <CardDescription>
          {total.toLocaleString('en-US')} active email{' '}
          {total === 1 ? 'subscriber' : 'subscribers'}. Only confirmed
          subscriptions that have not unsubscribed are listed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Active daily digest subscribers
              </caption>
              <thead>
                <tr className="border-b">
                  <th scope="col" className="px-3 py-2">
                    Email address
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Subscribed (UTC)
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="break-all px-3 py-2">{row.email}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {row.confirmed_at
                        ? new Intl.DateTimeFormat('en-GB', {
                            dateStyle: 'medium',
                            timeZone: 'UTC',
                          }).format(new Date(row.confirmed_at))
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {total === 0
              ? 'No active subscribers yet.'
              : 'No subscribers on this page.'}
          </p>
        )}
        <nav
          aria-label="Mailing list pagination"
          className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"
        >
          <span className="text-muted-foreground">
            {rows.length
              ? `${offset + 1}–${offset + rows.length} of ${total.toLocaleString('en-US')}`
              : `0 shown of ${total.toLocaleString('en-US')}`}
          </span>
          <div className="flex gap-4">
            {currentPage > 1 ? (
              <Link
                className="text-brand underline"
                href={pageUrl(currentPage - 1)}
                prefetch={false}
              >
                Previous subscribers
              </Link>
            ) : null}
            {offset + rows.length < total && rows.length > 0 ? (
              <Link
                className="text-brand underline"
                href={pageUrl(currentPage + 1)}
                prefetch={false}
              >
                Next subscribers
              </Link>
            ) : null}
          </div>
        </nav>
      </CardContent>
    </Card>
  )
}
