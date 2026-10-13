'use client'

import { useId, useMemo, useState } from 'react'
import { ChevronDown, Plus } from 'lucide-react'
import TweetCard from '@/components/TweetCard'
import { TweetAvatar } from '@/components/TweetAvatar'
import type { PortalTweet } from '@/lib/portal/types'

const monthFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

const monthOf = (iso: string) => {
  const date = new Date(iso)
  return Number.isFinite(date.getTime()) ? monthFormat.format(date) : ''
}

const firstLine = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean) ?? ''

const ROW_CLASS =
  'flex min-h-[3rem] w-full items-center gap-3 px-1 py-2 text-left text-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'

/**
 * One tweet as a single line (who, when, how it starts) that opens in place
 * to the full card. A tweet the answer cites carries its citation number.
 */
export function TweetRow({
  tweet,
  citation,
}: {
  tweet: PortalTweet
  citation?: number
}) {
  const [open, setOpen] = useState(false)
  const bodyId = useId()
  return (
    <li className="border-b border-border">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={bodyId}
        className={ROW_CLASS}
      >
        <TweetAvatar tweet={tweet} size={28} />
        <span className="shrink-0 font-medium text-foreground">
          @{tweet.username}
        </span>
        <span className="shrink-0 text-muted-foreground">
          {monthOf(tweet.createdAt)}
        </span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          {firstLine(tweet.text)}
        </span>
        {citation !== undefined && (
          <span
            aria-label={`Cited as ${citation}`}
            className="inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-muted px-1.5 text-[11px] font-semibold tabular-nums text-foreground"
          >
            {citation}
          </span>
        )}
        <ChevronDown
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div id={bodyId} className="pb-3 pl-10">
          <TweetCard tweet={tweet} showDate showExternalLink />
        </div>
      )}
    </li>
  )
}

/**
 * Tweets as rows, the first `first` shown and the rest behind a row of the
 * same shape that opens `step` more in place.
 */
export function TweetRowList({
  tweets,
  first,
  step = first,
  label,
  citations,
  moreLabel = (n) => `${n.toLocaleString('en-US')} more`,
}: {
  tweets: PortalTweet[]
  first: number
  step?: number
  label: string
  citations?: ReadonlyMap<string, number>
  moreLabel?: (n: number) => string
}) {
  const [shown, setShown] = useState(first)
  const left = tweets.length - shown
  return (
    <ul aria-label={label} className="border-t border-border">
      {tweets.slice(0, shown).map((tweet) => (
        <TweetRow
          key={tweet.id}
          tweet={tweet}
          citation={citations?.get(tweet.id)}
        />
      ))}
      {left > 0 && (
        <li className="border-b border-border">
          <button
            type="button"
            onClick={() => setShown((value) => value + step)}
            className={`${ROW_CLASS} text-muted-foreground hover:text-foreground`}
          >
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center">
              <Plus aria-hidden="true" className="h-4 w-4" />
            </span>
            {moreLabel(left)}
          </button>
        </li>
      )}
    </ul>
  )
}

interface Person {
  username: string
  tweets: PortalTweet[]
  from: string
  to: string
}

/** Groups tweets by author, most tweets first; each author keeps their order. */
export function groupByPerson(tweets: PortalTweet[]): Person[] {
  const groups = new Map<string, PortalTweet[]>()
  for (const tweet of tweets) {
    groups.set(tweet.username, [...(groups.get(tweet.username) ?? []), tweet])
  }
  return Array.from(groups.entries())
    .map(([username, list]) => {
      const months = list
        .map((tweet) => Date.parse(tweet.createdAt))
        .filter(Number.isFinite)
        .sort((a, b) => a - b)
      return {
        username,
        tweets: list,
        from: months.length ? monthFormat.format(months[0]) : '',
        to: months.length ? monthFormat.format(months[months.length - 1]) : '',
      }
    })
    .sort((a, b) => b.tweets.length - a.tweets.length)
}

function PersonRow({
  person,
  citations,
}: {
  person: Person
  citations?: ReadonlyMap<string, number>
}) {
  const [open, setOpen] = useState(false)
  const bodyId = useId()
  const count = person.tweets.length
  const range =
    person.from && person.from !== person.to
      ? `${person.from} to ${person.to}`
      : person.from
  return (
    <li className="border-b border-border">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={bodyId}
        className={ROW_CLASS}
      >
        <TweetAvatar tweet={person.tweets[0]} size={28} />
        <span className="shrink-0 font-medium text-foreground">
          @{person.username}
        </span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          {count} {count === 1 ? 'tweet' : 'tweets'}
          {range ? ` · ${range}` : ''}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div id={bodyId} className="pb-3 pl-10">
          <TweetRowList
            tweets={person.tweets}
            first={10}
            label={`Tweets by @${person.username}`}
            citations={citations}
          />
        </div>
      )}
    </li>
  )
}

/** One row per author: who said it, how often, over what span. */
export function PeopleList({
  tweets,
  label,
  citations,
}: {
  tweets: PortalTweet[]
  label: string
  citations?: ReadonlyMap<string, number>
}) {
  const people = useMemo(() => groupByPerson(tweets), [tweets])
  return (
    <ul aria-label={label} className="border-t border-border">
      {people.map((person) => (
        <PersonRow
          key={person.username}
          person={person}
          citations={citations}
        />
      ))}
    </ul>
  )
}
