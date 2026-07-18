'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Activity,
  ArrowUpRight,
  AtSign,
  Database,
  Heart,
  Quote,
  Search,
  Sparkles,
  Timer,
  Users,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

type Timing = {
  wallMs: number
  clickhouseMs: number
  rowsRead: number
  bytesRead: number
  roundTrips?: number
}

type SummaryResponse = {
  data: {
    totalAccounts: string
    memberAccounts: string
    totalTweets: string
    totalLikes: string
    totalUserMentions: string
    topMentionedUsers: Array<{
      account_id: string
      username: string
      display_name: string
      mention_count: string
    }>
    topAccountsByFollowers: Array<{
      account_id: string
      username: string
      display_name: string
      follower_count: string
    }>
    sourceUpdatedAt: string
    collectedAt: string
  }
  timing: Timing
}

type QuoteRow = {
  tweetId: string
  quoteCount: string
  accountId: string | null
  username: string | null
  displayName: string | null
  createdAt: string | null
  fullText: string | null
  favoriteCount: string
  retweetCount: string
}

type QuotesResponse = { data: QuoteRow[]; timing: Timing }

type TrendRow = {
  bucket: string
  tweets: string
  accounts: string
  totalTweets: string
  ratePerThousand: number
}

type TrendResponse = {
  data: TrendRow[]
  query: { tokens: string[]; bucket: string; match: string }
  timing: Timing
}

const compactNumber = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
})
const exactNumber = new Intl.NumberFormat('en-US')
const dateTime = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function number(value: string | number | null | undefined, compact = false) {
  const parsed = Number(value || 0)
  return (compact ? compactNumber : exactNumber).format(parsed)
}

function date(value: string | null | undefined) {
  if (!value) return 'Unknown'
  const parsed = new Date(
    value.includes('T') ? value : `${value.replace(' ', 'T')}Z`,
  )
  return Number.isNaN(parsed.valueOf()) ? value : dateTime.format(parsed)
}

function bytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`
  return `${(value / 1024 ** 3).toFixed(1)} GB`
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`/api/clickhouse/${path}`, { cache: 'no-store' })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status})`)
  }
  return payload as T
}

function TimingBadge({ timing }: { timing?: Timing }) {
  if (!timing) return null
  return (
    <Badge
      variant="outline"
      className="gap-1.5 font-normal text-muted-foreground"
    >
      <Timer className="h-3.5 w-3.5" />
      {number(timing.clickhouseMs)} ms CH · {number(timing.rowsRead, true)} rows
      · {bytes(timing.bytesRead)}
    </Badge>
  )
}

function LoadingPanel({ label }: { label: string }) {
  return (
    <div className="min-h-40 flex items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
      <Activity className="mr-2 h-4 w-4 animate-pulse" /> {label}
    </div>
  )
}

export default function ClickHouseLabClient() {
  const router = useRouter()
  const [summary, setSummary] = useState<SummaryResponse | null>(null)
  const [quotes, setQuotes] = useState<QuotesResponse | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [identifier, setIdentifier] = useState('')
  const [wordQuery, setWordQuery] = useState('')
  const [bucket, setBucket] = useState('month')
  const [match, setMatch] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [trend, setTrend] = useState<TrendResponse | null>(null)
  const [trendScale, setTrendScale] = useState<'raw' | 'normalized'>(
    'normalized',
  )
  const [trendLoading, setTrendLoading] = useState(false)
  const [trendError, setTrendError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      request<SummaryResponse>('summary'),
      request<QuotesResponse>('top-quotes?limit=25'),
    ])
      .then(([summaryResponse, quotesResponse]) => {
        if (cancelled) return
        setSummary(summaryResponse)
        setQuotes(quotesResponse)
      })
      .catch((error) => {
        if (!cancelled)
          setLoadError(
            error instanceof Error ? error.message : 'Unable to load analytics',
          )
      })
    return () => {
      cancelled = true
    }
  }, [])

  const chartData = useMemo(
    () =>
      (trend?.data || []).map((row) => ({
        ...row,
        label: row.bucket.slice(0, 10),
        value: trendScale === 'raw' ? Number(row.tweets) : row.ratePerThousand,
      })),
    [trend, trendScale],
  )

  function openUser(event: FormEvent) {
    event.preventDefault()
    const clean = identifier.trim().replace(/^@/, '')
    if (clean) router.push(`/clickhouse/user/${encodeURIComponent(clean)}`)
  }

  async function runTrend(event: FormEvent) {
    event.preventDefault()
    setTrendLoading(true)
    setTrendError(null)
    const params = new URLSearchParams({ q: wordQuery, bucket, match })
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    try {
      setTrend(await request<TrendResponse>(`word-trend?${params}`))
    } catch (error) {
      setTrendError(
        error instanceof Error ? error.message : 'Unable to run trend',
      )
    } finally {
      setTrendLoading(false)
    }
  }

  return (
    <main className="flex-1 bg-card dark:bg-background">
      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <section className="relative overflow-hidden rounded-2xl border bg-background p-7 sm:p-10">
          <div className="absolute -right-24 -top-28 h-72 w-72 rounded-full bg-brand/10 blur-3xl" />
          <div className="relative flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
            <div className="max-w-3xl">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Badge className="gap-1.5 bg-brand text-brand-foreground">
                  <Database className="h-3.5 w-3.5" /> ClickHouse staging lab
                </Badge>
                {summary ? <TimingBadge timing={summary.timing} /> : null}
              </div>
              <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                Ask the archive at analytical speed.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
                A staging-only surface over the canonical ClickHouse projection.
                PostgreSQL remains the app and policy database; this lab tests
                analytical reads before any public cutover.
              </p>
            </div>
            <form onSubmit={openUser} className="flex w-full max-w-md gap-2">
              <div className="relative flex-1">
                <AtSign className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  placeholder="username or account ID"
                  className="pl-9"
                  aria-label="Username or account ID"
                />
              </div>
              <Button type="submit" disabled={!identifier.trim()}>
                User page <ArrowUpRight className="ml-2 h-4 w-4" />
              </Button>
            </form>
          </div>
        </section>

        {loadError ? (
          <div className="mt-6 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-950 dark:border-red-800 dark:bg-red-950/30 dark:text-red-100">
            {loadError}
          </div>
        ) : null}

        <section className="mt-8">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">
                Global summary
              </p>
              <h2 className="mt-1 text-2xl font-semibold">
                Canonical corpus now
              </h2>
            </div>
            {summary ? (
              <p className="text-right text-xs text-muted-foreground">
                snapshot {date(summary.data.collectedAt)}
                <br />
                newest observation {date(summary.data.sourceUpdatedAt)}
              </p>
            ) : null}
          </div>
          {summary ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                {[
                  ['Tweets', summary.data.totalTweets, Database],
                  ['Authors', summary.data.totalAccounts, Users],
                  ['Observed likes', summary.data.totalLikes, Heart],
                  ['Mention edges', summary.data.totalUserMentions, AtSign],
                  ['Opted-in members', summary.data.memberAccounts, Sparkles],
                ].map(([label, value, Icon]) => (
                  <Card key={String(label)}>
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>{String(label)}</span>
                        <Icon className="h-4 w-4" />
                      </div>
                      <strong className="mt-3 block text-3xl font-semibold tracking-tight">
                        {number(String(value), true)}
                      </strong>
                      <span className="text-xs text-muted-foreground">
                        {number(String(value))} computed snapshot
                      </span>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                      Most mentioned across the corpus
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    {summary.data.topMentionedUsers
                      .slice(0, 8)
                      .map((row, index) => (
                        <Link
                          key={row.account_id}
                          href={`/clickhouse/user/${row.account_id}`}
                          className="flex items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted"
                        >
                          <span className="w-5 text-xs tabular-nums text-muted-foreground">
                            {index + 1}
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            <strong>@{row.username || 'unknown'}</strong>
                            <span className="ml-2 text-muted-foreground">
                              {row.display_name}
                            </span>
                          </span>
                          <span className="tabular-nums text-muted-foreground">
                            {number(row.mention_count, true)}
                          </span>
                        </Link>
                      ))}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                      Largest observed audiences
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    {summary.data.topAccountsByFollowers
                      .slice(0, 8)
                      .map((row, index) => (
                        <Link
                          key={row.account_id}
                          href={`/clickhouse/user/${row.account_id}`}
                          className="flex items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted"
                        >
                          <span className="w-5 text-xs tabular-nums text-muted-foreground">
                            {index + 1}
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            <strong>@{row.username || 'unknown'}</strong>
                            <span className="ml-2 text-muted-foreground">
                              {row.display_name}
                            </span>
                          </span>
                          <span className="tabular-nums text-muted-foreground">
                            {number(row.follower_count, true)}
                          </span>
                        </Link>
                      ))}
                  </CardContent>
                </Card>
              </div>
            </>
          ) : (
            <LoadingPanel label="Loading canonical summary" />
          )}
        </section>

        <section className="mt-12">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">
                Word trends
              </p>
              <h2 className="mt-1 text-2xl font-semibold">
                Language over time
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Compare raw matches or normalize them per 1,000 archived tweets
                in each period.
              </p>
            </div>
            <TimingBadge timing={trend?.timing} />
          </div>
          <Card>
            <CardContent className="p-5 sm:p-6">
              <form
                onSubmit={runTrend}
                className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_130px_130px_150px_150px_auto]"
              >
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={wordQuery}
                    onChange={(event) => setWordQuery(event.target.value)}
                    placeholder="e.g. AI, community archive"
                    className="pl-9"
                    required
                  />
                </div>
                <select
                  value={match}
                  onChange={(event) => setMatch(event.target.value)}
                  className="h-10 rounded-md border bg-background px-3 text-sm"
                >
                  <option value="all">All words</option>
                  <option value="any">Any word</option>
                </select>
                <select
                  value={bucket}
                  onChange={(event) => setBucket(event.target.value)}
                  className="h-10 rounded-md border bg-background px-3 text-sm"
                >
                  <option value="day">Daily</option>
                  <option value="week">Weekly</option>
                  <option value="month">Monthly</option>
                  <option value="year">Yearly</option>
                </select>
                <Input
                  type="date"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                  aria-label="From date"
                />
                <Input
                  type="date"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  aria-label="To date"
                />
                <Button
                  type="submit"
                  disabled={trendLoading || !wordQuery.trim()}
                >
                  {trendLoading ? 'Aggregating…' : 'Run trend'}
                </Button>
              </form>
              {trendError ? (
                <p className="mt-4 text-sm text-red-500">{trendError}</p>
              ) : null}
              {trend ? (
                <div className="mt-6">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">
                      {trend.query.tokens
                        .map((token) => `“${token}”`)
                        .join(trend.query.match === 'all' ? ' + ' : ' / ')}{' '}
                      · {trend.data.length} buckets
                    </p>
                    <div className="flex rounded-md border p-0.5 text-xs">
                      <button
                        type="button"
                        onClick={() => setTrendScale('normalized')}
                        className={`rounded px-2.5 py-1 ${trendScale === 'normalized' ? 'bg-muted font-medium' : 'text-muted-foreground'}`}
                      >
                        Per 1K tweets
                      </button>
                      <button
                        type="button"
                        onClick={() => setTrendScale('raw')}
                        className={`rounded px-2.5 py-1 ${trendScale === 'raw' ? 'bg-muted font-medium' : 'text-muted-foreground'}`}
                      >
                        Raw matches
                      </button>
                    </div>
                  </div>
                  <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={chartData}
                        margin={{ top: 10, right: 12, bottom: 4, left: 0 }}
                      >
                        <defs>
                          <linearGradient
                            id="wordTrendFill"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="5%"
                              stopColor="hsl(var(--brand))"
                              stopOpacity={0.35}
                            />
                            <stop
                              offset="95%"
                              stopColor="hsl(var(--brand))"
                              stopOpacity={0.02}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="hsl(var(--border))"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 11 }}
                          minTickGap={36}
                          stroke="hsl(var(--muted-foreground))"
                        />
                        <YAxis
                          tick={{ fontSize: 11 }}
                          width={54}
                          tickFormatter={(value) => number(value, true)}
                          stroke="hsl(var(--muted-foreground))"
                        />
                        <Tooltip
                          formatter={(value: number) => [
                            trendScale === 'raw'
                              ? number(value)
                              : `${Number(value).toFixed(2)} / 1K`,
                            trendScale === 'raw' ? 'Tweets' : 'Rate',
                          ]}
                          labelFormatter={(label) => String(label)}
                          contentStyle={{
                            background: 'hsl(var(--popover))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="value"
                          stroke="hsl(var(--brand))"
                          strokeWidth={2}
                          fill="url(#wordTrendFill)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <div className="mt-6 flex h-64 items-center justify-center rounded-lg border border-dashed text-center text-sm text-muted-foreground">
                  Enter up to four words to aggregate the full corpus by day,
                  week, month, or year.
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="mt-12">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">
                Quote graph
              </p>
              <h2 className="mt-1 text-2xl font-semibold">Most quoted posts</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Unique archived quote posts grouped by their target tweet.
              </p>
            </div>
            <TimingBadge timing={quotes?.timing} />
          </div>
          {quotes ? (
            <Card>
              <CardContent className="divide-y p-0">
                {quotes.data.map((row, index) => (
                  <article
                    key={row.tweetId}
                    className="grid gap-3 p-5 sm:grid-cols-[42px_90px_minmax(0,1fr)_auto] sm:items-start"
                  >
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <strong className="block text-xl tabular-nums">
                        {number(row.quoteCount)}
                      </strong>
                      <span className="text-xs text-muted-foreground">
                        quote posts
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="line-clamp-3 text-sm leading-6">
                        {row.fullText ||
                          'Target tweet is not present in the current corpus.'}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>@{row.username || 'unknown'}</span>
                        <span>{date(row.createdAt)}</span>
                        <span>♥ {number(row.favoriteCount, true)}</span>
                        <span>↻ {number(row.retweetCount, true)}</span>
                      </div>
                    </div>
                    <a
                      href={
                        row.username
                          ? `https://x.com/${encodeURIComponent(row.username)}/status/${row.tweetId}`
                          : `https://x.com/i/status/${row.tweetId}`
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center text-xs font-medium text-brand hover:underline"
                    >
                      Open <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                    </a>
                  </article>
                ))}
              </CardContent>
            </Card>
          ) : (
            <LoadingPanel label="Counting quote targets" />
          )}
        </section>
      </div>
    </main>
  )
}
