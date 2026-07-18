'use client'

import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ArrowUpRight,
  AtSign,
  Database,
  Heart,
  MessageCircle,
  Quote,
  Repeat2,
  Search,
  Timer,
  Users,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

type Timing = {
  wallMs: number
  clickhouseMs: number
  rowsRead: number
  bytesRead: number
}

type UserResponse = {
  data: {
    account: {
      accountId: string
      username: string
      displayName: string
      bio: string | null
      avatarUrl: string | null
      headerUrl: string | null
      followers: string
      following: string
      statusCount: string
      latestObservedAt: string
    }
    topTweets: Array<{
      tweetId: string
      createdAt: string
      fullText: string
      replyToUsername: string | null
      favoriteCount: string
      retweetCount: string
    }>
    topInteractedAccounts: Array<{
      accountId: string
      username: string | null
      displayName: string | null
      avatarUrl: string | null
      interactionCount: string
      mentionCount: string
      replyCount: string
      quoteCount: string
      repostCount: string
    }>
  }
  timing: Timing
}

const compactNumber = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
})
const exactNumber = new Intl.NumberFormat('en-US')
const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' })

function number(value: string | number | null | undefined, compact = false) {
  return (compact ? compactNumber : exactNumber).format(Number(value || 0))
}

function date(value: string | null | undefined) {
  if (!value) return 'Unknown date'
  const parsed = new Date(
    value.includes('T') ? value : `${value.replace(' ', 'T')}Z`,
  )
  return Number.isNaN(parsed.valueOf()) ? value : dateFormat.format(parsed)
}

async function loadUser(identifier: string): Promise<UserResponse> {
  const response = await fetch(
    `/api/clickhouse/user/${encodeURIComponent(identifier)}?limit=25`,
    { cache: 'no-store' },
  )
  const payload = await response.json().catch(() => ({}))
  if (!response.ok)
    throw new Error(payload.error || `Request failed (${response.status})`)
  return payload as UserResponse
}

function CountBadge({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof AtSign
  label: string
  value: string
}) {
  if (!Number(value)) return null
  return (
    <Badge variant="secondary" className="gap-1 font-normal">
      <Icon className="h-3 w-3" /> {number(value, true)} {label}
    </Badge>
  )
}

export default function ClickHouseUserClient({
  identifier,
}: {
  identifier: string
}) {
  const router = useRouter()
  const [data, setData] = useState<UserResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    let cancelled = false
    setData(null)
    setError(null)
    loadUser(identifier)
      .then((response) => {
        if (!cancelled) setData(response)
      })
      .catch((requestError) => {
        if (!cancelled)
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'Unable to load user',
          )
      })
    return () => {
      cancelled = true
    }
  }, [identifier])

  function openUser(event: FormEvent) {
    event.preventDefault()
    const clean = search.trim().replace(/^@/, '')
    if (clean) router.push(`/clickhouse/user/${encodeURIComponent(clean)}`)
  }

  if (error) {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-20">
        <Card className="w-full max-w-xl">
          <CardContent className="p-8 text-center">
            <Database className="mx-auto h-8 w-8 text-muted-foreground" />
            <h1 className="mt-4 text-2xl font-semibold">Account unavailable</h1>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <Button asChild className="mt-6">
              <Link href="/clickhouse">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to the lab
              </Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    )
  }

  if (!data) {
    return (
      <main className="flex flex-1 items-center justify-center py-24 text-sm text-muted-foreground">
        <Database className="mr-2 h-5 w-5 animate-pulse" />
        Building the ClickHouse user view…
      </main>
    )
  }

  const { account, topTweets, topInteractedAccounts } = data.data
  return (
    <main className="flex-1 bg-card dark:bg-background">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/clickhouse">
              <ArrowLeft className="mr-2 h-4 w-4" />
              ClickHouse lab
            </Link>
          </Button>
          <form onSubmit={openUser} className="flex w-full max-w-sm gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="another username"
                className="pl-9"
              />
            </div>
            <Button type="submit" variant="secondary" disabled={!search.trim()}>
              Open
            </Button>
          </form>
        </div>

        <section className="relative overflow-hidden rounded-2xl border bg-background">
          {account.headerUrl ? (
            <div
              className="h-36 bg-cover bg-center sm:h-48"
              style={{
                backgroundImage: `url(${JSON.stringify(account.headerUrl).slice(1, -1)})`,
              }}
            />
          ) : (
            <div className="h-24 bg-gradient-to-r from-brand/20 via-brand/5 to-transparent" />
          )}
          <div className="p-6 sm:p-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <Avatar className="-mt-16 h-24 w-24 border-4 border-background bg-muted sm:h-28 sm:w-28">
                <AvatarImage
                  src={account.avatarUrl || undefined}
                  alt={`@${account.username}`}
                />
                <AvatarFallback className="text-3xl">
                  {(account.displayName || account.username || '?')
                    .slice(0, 1)
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h1 className="truncate text-3xl font-semibold">
                      {account.displayName || account.username}
                    </h1>
                    <p className="text-muted-foreground">@{account.username}</p>
                  </div>
                  <Badge variant="outline" className="gap-1.5">
                    <Timer className="h-3.5 w-3.5" />
                    {number(data.timing.clickhouseMs)} ms CH
                  </Badge>
                </div>
                {account.bio ? (
                  <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">
                    {account.bio}
                  </p>
                ) : null}
                <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                  <span>
                    <strong>{number(account.statusCount, true)}</strong>{' '}
                    statuses
                  </span>
                  <span>
                    <strong>{number(account.followers, true)}</strong> followers
                  </span>
                  <span>
                    <strong>{number(account.following, true)}</strong> following
                  </span>
                  <span className="text-muted-foreground">
                    observed {date(account.latestObservedAt)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
          <section>
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">
                Top tweets
              </p>
              <h2 className="mt-1 text-2xl font-semibold">
                Highest observed engagement
              </h2>
            </div>
            <Card>
              <CardContent className="divide-y p-0">
                {topTweets.map((tweet, index) => (
                  <article key={tweet.tweetId} className="p-5 sm:p-6">
                    <div className="flex gap-4">
                      <span className="w-7 flex-none text-xs tabular-nums text-muted-foreground">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="whitespace-pre-wrap text-sm leading-6">
                          {tweet.fullText}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                          {tweet.replyToUsername ? (
                            <span>reply to @{tweet.replyToUsername}</span>
                          ) : null}
                          <span>{date(tweet.createdAt)}</span>
                          <span className="inline-flex items-center gap-1">
                            <Heart className="h-3.5 w-3.5" />
                            {number(tweet.favoriteCount, true)}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Repeat2 className="h-3.5 w-3.5" />
                            {number(tweet.retweetCount, true)}
                          </span>
                          <a
                            href={`https://x.com/${encodeURIComponent(account.username)}/status/${tweet.tweetId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="ml-auto inline-flex items-center font-medium text-brand hover:underline"
                          >
                            Open <ArrowUpRight className="ml-1 h-3 w-3" />
                          </a>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </CardContent>
            </Card>
          </section>

          <section>
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">
                Interaction graph
              </p>
              <h2 className="mt-1 text-2xl font-semibold">
                Top interacted accounts
              </h2>
            </div>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-normal text-muted-foreground">
                  <Users className="h-4 w-4" />
                  Mentions, replies, quotes, and repost targets
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 px-3 pb-4">
                {topInteractedAccounts.map((row, index) => (
                  <Link
                    href={`/clickhouse/user/${row.accountId}`}
                    key={row.accountId}
                    className="block rounded-lg p-3 hover:bg-muted"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-5 text-xs tabular-nums text-muted-foreground">
                        {index + 1}
                      </span>
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={row.avatarUrl || undefined} />
                        <AvatarFallback>
                          {(row.displayName || row.username || '?')
                            .slice(0, 1)
                            .toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {row.displayName || row.username || row.accountId}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          @{row.username || row.accountId}
                        </p>
                      </div>
                      <strong className="text-sm tabular-nums">
                        {number(row.interactionCount, true)}
                      </strong>
                    </div>
                    <div className="ml-8 mt-2 flex flex-wrap gap-1.5">
                      <CountBadge
                        icon={AtSign}
                        label="mentions"
                        value={row.mentionCount}
                      />
                      <CountBadge
                        icon={MessageCircle}
                        label="replies"
                        value={row.replyCount}
                      />
                      <CountBadge
                        icon={Quote}
                        label="quotes"
                        value={row.quoteCount}
                      />
                      <CountBadge
                        icon={Repeat2}
                        label="reposts"
                        value={row.repostCount}
                      />
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </main>
  )
}
