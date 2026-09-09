'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  KIND_LABELS,
  RESPONSE_LABELS,
  formatDate,
  type Opportunity,
} from '@/lib/bulletin/types'
import { tweetPermalinkHref, userProfileHref } from '@/lib/navigation'

export function OpportunityBoard({
  opportunities,
}: {
  opportunities: Opportunity[]
}) {
  const [side, setSide] = useState('all')
  const [kind, setKind] = useState('all')
  const [search, setSearch] = useState('')
  const filtered = useMemo(
    () =>
      opportunities.filter(
        (o) =>
          (side === 'all' || o.side === side) &&
          (kind === 'all' || o.kind === kind) &&
          [o.summary, o.username, o.place, ...o.topics]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(search.trim().toLowerCase()),
      ),
    [opportunities, side, kind, search],
  )
  const reset = () => {
    setSide('all')
    setKind('all')
    setSearch('')
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-lg border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap gap-2" aria-label="Ask or offer">
          {['all', 'ask', 'offer'].map((value) => (
            <Button
              key={value}
              variant={side === value ? 'default' : 'outline'}
              aria-pressed={side === value}
              onClick={() => setSide(value)}
            >
              {value === 'all'
                ? 'All notices'
                : value === 'ask'
                  ? 'Asks'
                  : 'Offers'}
            </Button>
          ))}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              aria-label="Search opportunities"
              placeholder="Search topics, people, or places"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
            />
          </div>
          <select
            aria-label="Category"
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm sm:w-48"
          >
            <option value="all">All categories</option>
            {Object.entries(KIND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p role="status" className="text-sm text-muted-foreground">
        {filtered.length} of {opportunities.length} notices
        {opportunities.length === 200
          ? ' · Showing the latest 200 active notices'
          : ''}
      </p>
      {filtered.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((o) => (
            <article
              key={o.tweet_id}
              className="flex flex-col rounded-lg border bg-card p-5 sm:p-6"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-muted px-2.5 py-1 font-semibold">
                  {o.side === 'ask' ? 'Asking' : 'Offering'}
                </span>
                <span className="text-muted-foreground">
                  {KIND_LABELS[o.kind] ?? o.kind}
                </span>
                <time
                  className="ml-auto text-muted-foreground"
                  dateTime={o.posted_at}
                >
                  {formatDate(o.posted_at)}
                </time>
              </div>
              <h2 className="mt-4 text-xl font-semibold leading-snug">
                {o.summary}
              </h2>
              <Link
                href={userProfileHref(o.username, o.account_id)}
                className="mt-2 w-fit text-sm text-brand hover:underline"
              >
                @{o.username}
              </Link>
              <blockquote className="mt-4 whitespace-pre-wrap break-words border-l-2 pl-3 text-sm leading-6 text-muted-foreground">
                “{o.evidence}”
              </blockquote>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
                {Array.from(new Set(o.topics)).map((topic) => (
                  <span key={topic} className="rounded-md bg-muted px-2 py-1">
                    {topic}
                  </span>
                ))}
              </div>
              {(o.place || o.expires_at || o.standing) && (
                <p className="mt-3 text-xs text-muted-foreground">
                  {[
                    o.place,
                    o.expires_at
                      ? `Until ${formatDate(o.expires_at)}`
                      : o.standing
                        ? 'Ongoing offer or request'
                        : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
              <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-5">
                <span className="text-xs text-muted-foreground">
                  {RESPONSE_LABELS[o.respond]}
                </span>
                <Link
                  href={tweetPermalinkHref(
                    o.tweet_id,
                    'opportunities',
                    '/opportunities',
                  )}
                  className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
                >
                  View original post{' '}
                  <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed px-6 py-14 text-center">
          <h2 className="text-xl font-semibold">
            {opportunities.length
              ? 'No matching notices'
              : 'No opportunities yet'}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {opportunities.length
              ? 'Try a different search or clear the filters.'
              : 'New asks and offers will appear here after the daily scan.'}
          </p>
          {opportunities.length > 0 && (
            <Button className="mt-4" variant="outline" onClick={reset}>
              Clear filters
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
