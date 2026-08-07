'use client'

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
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
  SlidersHorizontal,
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
import { Switch } from '@/components/ui/switch'
import { capturePostHogEvent } from '@/lib/posthog'

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
  quotingAccounts: string | null
  selfQuotesRemoved: string
  accountId: string | null
  username: string | null
  displayName: string | null
  createdAt: string | null
  fullText: string | null
  favoriteCount: string
  retweetCount: string
}

type QuotesResponse = {
  data: QuoteRow[]
  query: {
    limit: number
    excludeSelf: boolean
    targetCommunityUsersOnly: boolean
    quoteCommunityUsersOnly: boolean
    includeUsernames: string[]
    excludeUsernames: string[]
    unresolvedIncludeUsernames: string[]
    unresolvedExcludeUsernames: string[]
    selfQuotesRemoved: string
    unresolvedTargetAuthors?: number
    candidateRankingTruncated: boolean
  }
  timing: Timing
}

type QuotePostRow = {
  tweetId: string
  accountId: string
  username: string | null
  displayName: string | null
  avatarUrl: string | null
  createdAt: string
  fullText: string
  favoriteCount: string
  retweetCount: string
}

type QuotePostsResponse = {
  data: QuotePostRow[]
  query: {
    tweetId: string
    limit: number
    offset: number
    total: string
    excludeSelf: boolean
    quoteCommunityUsersOnly: boolean
    includeUsernames: string[]
    excludeUsernames: string[]
    unresolvedIncludeUsernames: string[]
    unresolvedExcludeUsernames: string[]
  }
  timing: Timing
}

type QuoteEvidenceState = {
  data: QuotePostRow[]
  query?: QuotePostsResponse['query']
  timing?: Timing
  loading: boolean
  error: string | null
}

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
  const quoteEvidenceGeneration = useRef(0)
  const activeQuoteEvidenceRequests = useRef(new Set<string>())
  const [summary, setSummary] = useState<SummaryResponse | null>(null)
  const [quotes, setQuotes] = useState<QuotesResponse | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [quotesLoading, setQuotesLoading] = useState(true)
  const [quotesError, setQuotesError] = useState<string | null>(null)
  const [quoteLimit, setQuoteLimit] = useState('25')
  const [excludeSelfQuotes, setExcludeSelfQuotes] = useState(true)
  const [targetCommunityUsersOnly, setTargetCommunityUsersOnly] = useState(true)
  const [quoteCommunityUsersOnly, setQuoteCommunityUsersOnly] = useState(true)
  const [includeQuoteUsernames, setIncludeQuoteUsernames] = useState('')
  const [excludeQuoteUsernames, setExcludeQuoteUsernames] = useState('')
  const [expandedQuoteTweetId, setExpandedQuoteTweetId] = useState<
    string | null
  >(null)
  const [quoteEvidence, setQuoteEvidence] = useState<
    Record<string, QuoteEvidenceState>
  >({})
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
    request<SummaryResponse>('summary')
      .then((summaryResponse) => {
        if (!cancelled) setSummary(summaryResponse)
      })
      .catch((error) => {
        if (!cancelled)
          setLoadError(
            error instanceof Error ? error.message : 'Unable to load analytics',
          )
      })
    request<QuotesResponse>(
      'top-quotes?limit=25&exclude_self=true&target_ca_users_only=true&quote_ca_users_only=true',
    )
      .then((quotesResponse) => {
        if (!cancelled) setQuotes(quotesResponse)
      })
      .catch((error) => {
        if (!cancelled)
          setQuotesError(
            error instanceof Error
              ? error.message
              : 'Unable to count quote targets',
          )
      })
      .finally(() => {
        if (!cancelled) setQuotesLoading(false)
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
    capturePostHogEvent('word_trend_requested', {
      bucket,
      match,
      has_start_date: Boolean(from),
      has_end_date: Boolean(to),
    })
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

  async function runQuotes(event: FormEvent) {
    event.preventDefault()
    setQuotesLoading(true)
    setQuotesError(null)
    const params = new URLSearchParams({
      limit: quoteLimit,
      exclude_self: String(excludeSelfQuotes),
      target_ca_users_only: String(targetCommunityUsersOnly),
      quote_ca_users_only: String(quoteCommunityUsersOnly),
    })
    if (includeQuoteUsernames.trim()) {
      params.set('include_usernames', includeQuoteUsernames)
    }
    if (excludeQuoteUsernames.trim()) {
      params.set('exclude_usernames', excludeQuoteUsernames)
    }
    capturePostHogEvent('quote_ranking_requested', {
      limit: Number(quoteLimit),
      excludes_self_quotes: excludeSelfQuotes,
      has_include_filter: Boolean(includeQuoteUsernames.trim()),
      has_exclude_filter: Boolean(excludeQuoteUsernames.trim()),
    })
    try {
      const response = await request<QuotesResponse>(`top-quotes?${params}`)
      quoteEvidenceGeneration.current += 1
      activeQuoteEvidenceRequests.current.clear()
      setQuotes(response)
      setExpandedQuoteTweetId(null)
      setQuoteEvidence({})
    } catch (error) {
      setQuotesError(
        error instanceof Error
          ? error.message
          : 'Unable to count quote targets',
      )
    } finally {
      setQuotesLoading(false)
    }
  }

  function quoteEvidenceParams(offset: number) {
    const params = new URLSearchParams({
      limit: '25',
      offset: String(offset),
      exclude_self: String(quotes?.query.excludeSelf !== false),
      quote_ca_users_only: String(
        quotes?.query.quoteCommunityUsersOnly !== false,
      ),
    })
    if (quotes?.query.includeUsernames.length) {
      params.set('include_usernames', quotes.query.includeUsernames.join(','))
    }
    if (quotes?.query.excludeUsernames.length) {
      params.set('exclude_usernames', quotes.query.excludeUsernames.join(','))
    }
    return params
  }

  async function loadQuoteEvidence(tweetId: string, offset = 0) {
    const generation = quoteEvidenceGeneration.current
    const requestKey = `${generation}:${tweetId}:${offset}`
    if (activeQuoteEvidenceRequests.current.has(requestKey)) return
    activeQuoteEvidenceRequests.current.add(requestKey)

    setQuoteEvidence((current) => ({
      ...current,
      [tweetId]: {
        data: offset ? current[tweetId]?.data || [] : [],
        query: current[tweetId]?.query,
        timing: current[tweetId]?.timing,
        loading: true,
        error: null,
      },
    }))
    try {
      const response = await request<QuotePostsResponse>(
        `quote-posts/${encodeURIComponent(tweetId)}?${quoteEvidenceParams(offset)}`,
      )
      setQuoteEvidence((current) =>
        quoteEvidenceGeneration.current === generation
          ? {
              ...current,
              [tweetId]: {
                data: offset
                  ? [...(current[tweetId]?.data || []), ...response.data]
                  : response.data,
                query: response.query,
                timing: response.timing,
                loading: false,
                error: null,
              },
            }
          : current,
      )
    } catch (error) {
      setQuoteEvidence((current) =>
        quoteEvidenceGeneration.current === generation
          ? {
              ...current,
              [tweetId]: {
                data: current[tweetId]?.data || [],
                query: current[tweetId]?.query,
                timing: current[tweetId]?.timing,
                loading: false,
                error:
                  error instanceof Error
                    ? error.message
                    : 'Unable to load quote posts',
              },
            }
          : current,
      )
    } finally {
      activeQuoteEvidenceRequests.current.delete(requestKey)
    }
  }

  function toggleQuoteEvidence(tweetId: string) {
    if (expandedQuoteTweetId === tweetId) {
      setExpandedQuoteTweetId(null)
      return
    }
    setExpandedQuoteTweetId(tweetId)
    if (!quoteEvidence[tweetId]) void loadQuoteEvidence(tweetId)
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
                Unique archived quote posts grouped by target, with optional
                quoting-account filters.
              </p>
            </div>
            <TimingBadge timing={quotes?.timing} />
          </div>
          <Card>
            <form
              onSubmit={runQuotes}
              className="border-b bg-muted/20 p-4 sm:p-5"
            >
              <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-[minmax(210px,1fr)_minmax(210px,1fr)_minmax(230px,1fr)_120px_auto]">
                <div>
                  <span className="text-xs font-medium text-muted-foreground">
                    Target authors
                  </span>
                  <div className="mt-2 flex h-10 items-center gap-3 rounded-md border bg-background px-3">
                    <Switch
                      id="target-ca-users-only"
                      checked={targetCommunityUsersOnly}
                      onCheckedChange={setTargetCommunityUsersOnly}
                    />
                    <label
                      htmlFor="target-ca-users-only"
                      className="text-sm font-medium"
                    >
                      Only tweets by CA users
                    </label>
                  </div>
                </div>
                <div>
                  <span className="text-xs font-medium text-muted-foreground">
                    Quote authors
                  </span>
                  <div className="mt-2 flex h-10 items-center gap-3 rounded-md border bg-background px-3">
                    <Switch
                      id="quote-ca-users-only"
                      checked={quoteCommunityUsersOnly}
                      onCheckedChange={setQuoteCommunityUsersOnly}
                    />
                    <label
                      htmlFor="quote-ca-users-only"
                      className="text-sm font-medium"
                    >
                      Only quotes by CA users
                    </label>
                  </div>
                </div>
                <div>
                  <span className="text-xs font-medium text-muted-foreground">
                    Source-author rule
                  </span>
                  <div className="mt-2 flex h-10 items-center gap-3 rounded-md border bg-background px-3">
                    <Switch
                      id="exclude-self-quotes"
                      checked={excludeSelfQuotes}
                      onCheckedChange={setExcludeSelfQuotes}
                    />
                    <label
                      htmlFor="exclude-self-quotes"
                      className="text-sm font-medium"
                    >
                      Exclude the source-post author
                    </label>
                  </div>
                </div>
                <label className="grid gap-2 text-xs font-medium text-muted-foreground">
                  Top
                  <select
                    value={quoteLimit}
                    onChange={(event) => setQuoteLimit(event.target.value)}
                    className="h-10 rounded-md border bg-background px-3 text-sm text-foreground"
                  >
                    <option value="10">10</option>
                    <option value="25">25</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                  </select>
                </label>
                <Button type="submit" disabled={quotesLoading}>
                  {quotesLoading ? 'Counting…' : 'Rank quotes'}
                </Button>
              </div>
              <details className="group mt-4 rounded-md border bg-background">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
                  <SlidersHorizontal className="h-4 w-4 text-brand" />
                  Advanced username filters
                  <span className="text-xs font-normal text-muted-foreground">
                    optional include / exclude lists
                  </span>
                  <span className="ml-auto text-muted-foreground group-open:rotate-45">
                    +
                  </span>
                </summary>
                <div className="grid gap-4 border-t p-3 md:grid-cols-2">
                  <label className="grid gap-2 text-xs font-medium text-muted-foreground">
                    Only count quote posts by
                    <textarea
                      value={includeQuoteUsernames}
                      onChange={(event) =>
                        setIncludeQuoteUsernames(event.target.value)
                      }
                      rows={3}
                      placeholder="exgenesis, wereness, …"
                      className="min-h-20 w-full resize-y rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <span className="font-normal">
                      Comma or space separated · up to 100 usernames
                    </span>
                  </label>
                  <label className="grid gap-2 text-xs font-medium text-muted-foreground">
                    Do not count quote posts by
                    <textarea
                      value={excludeQuoteUsernames}
                      onChange={(event) =>
                        setExcludeQuoteUsernames(event.target.value)
                      }
                      rows={3}
                      placeholder="spamaccount, botaccount, …"
                      className="min-h-20 w-full resize-y rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <span className="font-normal">
                      Exclusions override the include list
                    </span>
                  </label>
                </div>
              </details>
            </form>
            {quotesError ? (
              <p className="border-b px-5 py-3 text-sm text-red-500">
                {quotesError}
              </p>
            ) : null}
            {quotes ? (
              <>
                <div className="flex flex-wrap gap-x-3 gap-y-1 border-b px-5 py-3 text-xs text-muted-foreground">
                  <span>
                    {quotes.query.targetCommunityUsersOnly
                      ? 'Target tweets by CA users only'
                      : 'Target tweets by any archived account'}
                  </span>
                  <span>
                    ·{' '}
                    {quotes.query.quoteCommunityUsersOnly
                      ? 'Quote posts by CA users only'
                      : 'Quote posts by any archived account'}
                  </span>
                  <span>
                    ·{' '}
                    {quotes.query.excludeSelf
                      ? 'Source-author quotes excluded'
                      : 'Source-author quotes included'}
                  </span>
                  {quotes.query.includeUsernames.length ? (
                    <span>
                      · {quotes.query.includeUsernames.length} included username
                      {quotes.query.includeUsernames.length === 1 ? '' : 's'}
                    </span>
                  ) : null}
                  {quotes.query.excludeUsernames.length ? (
                    <span>
                      · {quotes.query.excludeUsernames.length} excluded username
                      {quotes.query.excludeUsernames.length === 1 ? '' : 's'}
                    </span>
                  ) : null}
                  {quotes.query.unresolvedIncludeUsernames.length ||
                  quotes.query.unresolvedExcludeUsernames.length ? (
                    <span className="text-amber-600 dark:text-amber-400">
                      ·{' '}
                      {quotes.query.unresolvedIncludeUsernames.length +
                        quotes.query.unresolvedExcludeUsernames.length}{' '}
                      username
                      {quotes.query.unresolvedIncludeUsernames.length +
                        quotes.query.unresolvedExcludeUsernames.length ===
                      1
                        ? ''
                        : 's'}{' '}
                      not found
                    </span>
                  ) : null}
                </div>
                {quotes.query.candidateRankingTruncated ? (
                  <p className="border-b bg-amber-50 px-5 py-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                    The candidate cap may have truncated this filtered ranking.
                  </p>
                ) : null}
                <CardContent className="divide-y p-0">
                  {quotes.data.map((row, index) => {
                    const evidence = quoteEvidence[row.tweetId]
                    const expanded = expandedQuoteTweetId === row.tweetId
                    const evidenceTotal = Number(evidence?.query?.total || 0)
                    return (
                      <div key={row.tweetId}>
                        <article className="grid gap-3 p-5 sm:grid-cols-[42px_90px_minmax(0,1fr)_auto] sm:items-start">
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
                              {row.quotingAccounts ? (
                                <span>
                                  {number(row.quotingAccounts)} quoting accounts
                                </span>
                              ) : null}
                              {Number(row.selfQuotesRemoved) ? (
                                <span>
                                  −{number(row.selfQuotesRemoved)} source-author
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 sm:flex-col sm:items-end">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => toggleQuoteEvidence(row.tweetId)}
                              aria-expanded={expanded}
                              aria-controls={`quote-evidence-${row.tweetId}`}
                            >
                              <Quote className="mr-1.5 h-3.5 w-3.5" />
                              {expanded ? 'Hide quotes' : 'Show quotes'}
                            </Button>
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
                          </div>
                        </article>
                        {expanded ? (
                          <section
                            id={`quote-evidence-${row.tweetId}`}
                            aria-label={`Quote posts for tweet ${row.tweetId}`}
                            className="border-t bg-muted/20 px-5 py-5 sm:pl-[174px]"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <h3 className="text-sm font-semibold">
                                  Archived quote posts
                                </h3>
                                {evidence?.query ? (
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    Showing {number(evidence.data.length)} of{' '}
                                    {number(evidence.query.total)} matching
                                    posts
                                  </p>
                                ) : null}
                              </div>
                              <TimingBadge timing={evidence?.timing} />
                            </div>
                            {evidence?.error ? (
                              <p className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-950 dark:border-red-800 dark:bg-red-950/30 dark:text-red-100">
                                {evidence.error}
                              </p>
                            ) : null}
                            {evidence?.query ? (
                              <p
                                className={`mt-4 rounded-md border px-3 py-2 text-xs ${
                                  evidenceTotal === Number(row.quoteCount)
                                    ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200'
                                    : 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200'
                                }`}
                              >
                                {evidenceTotal === Number(row.quoteCount)
                                  ? `Verified: the evidence query found the same ${number(evidence.query.total)} unique quote posts.`
                                  : `The evidence query currently finds ${number(evidence.query.total)} posts versus ${number(row.quoteCount)} in the cached ranking. Re-run the ranking if the archive changed.`}
                              </p>
                            ) : null}
                            {evidence?.data.length ? (
                              <div className="mt-4 divide-y rounded-md border bg-background">
                                {evidence.data.map((quotePost) => (
                                  <article
                                    key={quotePost.tweetId}
                                    className="flex items-start justify-between gap-4 p-4"
                                  >
                                    <div className="min-w-0">
                                      <p className="whitespace-pre-wrap text-sm leading-6">
                                        {quotePost.fullText ||
                                          'Archived quote post has no text.'}
                                      </p>
                                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                        <span>
                                          @{quotePost.username || 'unknown'}
                                        </span>
                                        <span>{date(quotePost.createdAt)}</span>
                                        <span>
                                          ♥{' '}
                                          {number(
                                            quotePost.favoriteCount,
                                            true,
                                          )}
                                        </span>
                                        <span>
                                          ↻{' '}
                                          {number(quotePost.retweetCount, true)}
                                        </span>
                                      </div>
                                    </div>
                                    <a
                                      href={
                                        quotePost.username
                                          ? `https://x.com/${encodeURIComponent(quotePost.username)}/status/${quotePost.tweetId}`
                                          : `https://x.com/i/status/${quotePost.tweetId}`
                                      }
                                      target="_blank"
                                      rel="noreferrer"
                                      className="shrink-0 text-xs font-medium text-brand hover:underline"
                                    >
                                      Open{' '}
                                      <ArrowUpRight className="ml-1 inline h-3.5 w-3.5" />
                                    </a>
                                  </article>
                                ))}
                              </div>
                            ) : evidence?.query && !evidence.loading ? (
                              <p className="mt-4 rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                                No archived quote posts match these filters.
                              </p>
                            ) : null}
                            {evidence?.loading && !evidence.data.length ? (
                              <div className="mt-4">
                                <LoadingPanel label="Loading quote posts" />
                              </div>
                            ) : null}
                            {evidence?.query &&
                            evidence.data.length < evidenceTotal ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="mt-4"
                                disabled={evidence.loading}
                                onClick={() =>
                                  void loadQuoteEvidence(
                                    row.tweetId,
                                    evidence.data.length,
                                  )
                                }
                              >
                                {evidence.loading ? 'Loading…' : 'Load 25 more'}
                              </Button>
                            ) : null}
                          </section>
                        ) : null}
                      </div>
                    )
                  })}
                  {!quotes.data.length ? (
                    <div className="p-10 text-center text-sm text-muted-foreground">
                      No quoted posts match this account set.
                    </div>
                  ) : null}
                </CardContent>
              </>
            ) : (
              <div className="p-5">
                <LoadingPanel label="Counting quote targets" />
              </div>
            )}
          </Card>
        </section>
      </div>
    </main>
  )
}
