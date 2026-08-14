import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import {
  Archive,
  ArrowUpRight,
  AtSign,
  MessageCircle,
  Radio,
} from 'lucide-react'

import { getSmallAvatarUrl } from '@/lib/avatar'
import type { MissingAccount } from '@/lib/missingAccounts'
import { getMissingAccounts } from '@/lib/missingAccounts'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Missing accounts | Community Archive',
  description:
    'See the accounts mentioned most often in the Community Archive that have not opted in or uploaded their archive yet.',
}

type View = 'opt-in' | 'archive'

const supportedAvatarHosts = new Set([
  'pbs.twimg.com',
  'd1ts43dypk8bqh.cloudfront.net',
  'www.gravatar.com',
  'opencollective-production.s3.us-west-1.amazonaws.com',
])
const numberFormatter = new Intl.NumberFormat('en-US')

function supportedAvatarUrl(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && supportedAvatarHosts.has(url.hostname)
      ? value
      : null
  } catch {
    return null
  }
}

function accountUrl(account: MissingAccount): string {
  return account.username
    ? `https://x.com/${account.username}`
    : `https://x.com/i/user/${account.accountId}`
}

function AccountIdentity({ account }: { account: MissingAccount }) {
  const avatarUrl = getSmallAvatarUrl(supportedAvatarUrl(account.avatarUrl))
  const displayName =
    account.displayName || account.username || 'Unknown account'
  const fallback = (account.username || account.displayName || '?')
    .slice(0, 1)
    .toUpperCase()

  return (
    <a
      href={accountUrl(account)}
      target="_blank"
      rel="noreferrer"
      className="group flex min-w-0 items-center gap-3 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-sm font-semibold text-muted-foreground">
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt=""
            fill
            sizes="40px"
            className="object-cover"
          />
        ) : (
          fallback
        )}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1 font-semibold text-foreground group-hover:underline">
          <span className="truncate">{displayName}</span>
          <ArrowUpRight
            aria-hidden="true"
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
          />
        </span>
        <span className="block truncate text-sm text-muted-foreground">
          {account.username ? `@${account.username}` : account.accountId}
        </span>
      </span>
    </a>
  )
}

function AccountRanking({
  accounts,
  view,
}: {
  accounts: MissingAccount[]
  view: View
}) {
  if (accounts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card px-6 py-14 text-center">
        <p className="font-medium text-foreground">No accounts to show yet.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          The ranking will appear when the latest archive data is available.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-left">
          <caption className="sr-only">
            Accounts ordered by how often archived posts reply to them
          </caption>
          <thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th scope="col" className="w-16 px-4 py-3 text-right font-medium">
                Rank
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Account
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                Replies
              </th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => (
              <tr
                key={`${view}:${account.accountId}`}
                className="border-t border-border transition-colors hover:bg-accent"
              >
                <td className="px-4 py-4 text-right text-sm font-semibold tabular-nums text-muted-foreground">
                  {account.rank}
                </td>
                <td className="px-4 py-4">
                  <AccountIdentity account={account} />
                </td>
                <td className="px-4 py-4 text-right font-semibold tabular-nums text-foreground">
                  {numberFormatter.format(Number(account.replyCount))}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    posts
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ViewTab({
  href,
  active,
  icon,
  label,
  count,
}: {
  href: string
  active: boolean
  icon: React.ReactNode
  label: string
  count: number
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-none ${
        active
          ? 'bg-background text-foreground'
          : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
      }`}
    >
      {icon}
      <span>{label}</span>
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
        {count}
      </span>
    </Link>
  )
}

export default async function MissingAccountsPage({
  searchParams,
}: {
  searchParams?: { view?: string }
}) {
  const view: View = searchParams?.view === 'archive' ? 'archive' : 'opt-in'
  let needsOptIn: MissingAccount[] = []
  let needsArchive: MissingAccount[] = []
  let unavailable = false

  try {
    const response = await getMissingAccounts()
    needsOptIn = response.data.needsOptIn
    needsArchive = response.data.needsArchive
  } catch (error) {
    unavailable = true
    console.error('Unable to load missing-account rankings:', error)
  }

  const accounts = view === 'archive' ? needsArchive : needsOptIn
  const title =
    view === 'archive' ? 'Opted in, no archive yet' : 'Not opted in yet'
  const introduction =
    view === 'archive'
      ? 'These are the opted-in accounts mentioned most often in the Community Archive that haven’t uploaded an archive yet.'
      : 'These are the accounts mentioned most often in the Community Archive that haven’t opted in yet.'
  const description =
    view === 'archive'
      ? 'Uploading their X archive would bring in the older posts from before they opted in.'
      : 'Opting in would let the community start preserving their new public posts.'

  return (
    <main className="min-h-screen bg-background py-12 md:py-16">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <AtSign aria-hidden="true" className="h-3.5 w-3.5" />
            Missing accounts
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Who should join next?
          </h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground sm:text-lg">
            {introduction}
          </p>
        </div>

        <nav
          aria-label="Missing account views"
          className="mx-auto mt-10 flex max-w-2xl rounded-lg bg-muted p-1"
        >
          <ViewTab
            href="/missing-accounts"
            active={view === 'opt-in'}
            icon={<Radio aria-hidden="true" className="h-4 w-4" />}
            label="Not opted in"
            count={needsOptIn.length}
          />
          <ViewTab
            href="/missing-accounts?view=archive"
            active={view === 'archive'}
            icon={<Archive aria-hidden="true" className="h-4 w-4" />}
            label="No archive yet"
            count={needsArchive.length}
          />
        </nav>

        <section aria-labelledby="ranking-title" className="mt-8">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2
                id="ranking-title"
                className="text-2xl font-semibold text-foreground"
              >
                {title}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
              <MessageCircle aria-hidden="true" className="h-4 w-4" />
              Most replied to first
            </div>
          </div>

          {unavailable ? (
            <div className="rounded-lg border border-dashed border-border bg-card px-6 py-14 text-center">
              <p className="font-medium text-foreground">
                The ranking is temporarily unavailable.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Please check back once the analytics service has caught up.
              </p>
            </div>
          ) : (
            <AccountRanking accounts={accounts} view={view} />
          )}
        </section>

        <div className="mt-8 grid gap-4 rounded-lg border border-border bg-muted p-5 text-sm sm:grid-cols-2 sm:p-6">
          <div>
            <h2 className="font-semibold text-foreground">
              Start collecting now
            </h2>
            <p className="mt-1 leading-6 text-muted-foreground">
              Opting in lets the community preserve new public posts as they
              appear.
            </p>
            <Link
              href="/opt-in"
              className="mt-3 inline-flex items-center gap-1 font-semibold text-brand hover:underline"
            >
              Opt in to streaming
              <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
          <div>
            <h2 className="font-semibold text-foreground">Fill in the past</h2>
            <p className="mt-1 leading-6 text-muted-foreground">
              An archive upload preserves historical posts from before live
              collection began.
            </p>
            <Link
              href="/#upload-archive"
              className="mt-3 inline-flex items-center gap-1 font-semibold text-brand hover:underline"
            >
              Upload an archive
              <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
