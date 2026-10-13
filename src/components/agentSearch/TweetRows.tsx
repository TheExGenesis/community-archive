'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
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
 * One tweet as a row led by what it says, with who and when in small type,
 * that opens in place into the full card. A tweet the answer cites carries
 * its citation number.
 */
export function TweetRow({
  tweet,
  citation,
  numbered = citation !== undefined,
  hideAuthor = false,
}: {
  tweet: PortalTweet
  citation?: number
  /** Keep the number's place even when this tweet is not cited. */
  numbered?: boolean
  /** Under a person's name, the row need not say who again. */
  hideAuthor?: boolean
}) {
  const [open, setOpen] = useState(false)
  const bodyId = useId()
  // The row and the open card have different buttons; keep focus on
  // whichever one now toggles, but not on first render.
  const rowRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const toggled = useRef(false)
  useEffect(() => {
    if (!toggled.current) return
    ;(open ? closeRef : rowRef).current?.focus()
  }, [open])
  const toggle = () => {
    toggled.current = true
    setOpen((value) => !value)
  }
  const chip = numbered && (
    <span className="inline-flex w-6 shrink-0 justify-center">
      {citation !== undefined && (
        <span
          aria-label={`Cited as ${citation}`}
          className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-muted px-1.5 text-[11px] font-semibold tabular-nums text-foreground"
        >
          {citation}
        </span>
      )}
    </span>
  )
  return (
    <li className="border-b border-border">
      {open ? (
        <div id={bodyId} className="flex items-start gap-2 py-1 pl-1 pr-1">
          {chip && <div className="pt-3">{chip}</div>}
          <div className="min-w-0 flex-1">
            <TweetCard tweet={tweet} showDate showExternalLink />
          </div>
          <div className="shrink-0 pt-3">
            <button
              ref={closeRef}
              type="button"
              onClick={toggle}
              aria-expanded
              aria-controls={bodyId}
              aria-label={`Collapse tweet by @${tweet.username}`}
              className="rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronDown aria-hidden="true" className="h-4 w-4 rotate-180" />
            </button>
          </div>
        </div>
      ) : (
        <button
          ref={rowRef}
          type="button"
          onClick={toggle}
          aria-expanded={false}
          aria-controls={bodyId}
          className={ROW_CLASS}
        >
          {chip}
          {!hideAuthor && <TweetAvatar tweet={tweet} size={28} />}
          <span className="min-w-0 flex-1">
            {!hideAuthor && (
              <span className="block truncate text-xs text-muted-foreground">
                @{tweet.username}
              </span>
            )}
            <span className="block truncate text-foreground">
              {firstLine(tweet.text)}
            </span>
          </span>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {monthOf(tweet.createdAt)}
          </span>
          <ChevronDown
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-muted-foreground"
          />
        </button>
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
  hideAuthor = false,
}: {
  tweets: PortalTweet[]
  first: number
  step?: number
  label: string
  citations?: ReadonlyMap<string, number>
  moreLabel?: (n: number) => string
  /** The rows sit under their author's name. */
  hideAuthor?: boolean
}) {
  const [shown, setShown] = useState(first)
  const left = tweets.length - shown
  const numbered = tweets.some((tweet) => citations?.has(tweet.id))
  return (
    <ul aria-label={label} className="border-t border-border">
      {tweets.slice(0, shown).map((tweet) => (
        <TweetRow
          key={tweet.id}
          tweet={tweet}
          citation={citations?.get(tweet.id)}
          numbered={numbered}
          hideAuthor={hideAuthor}
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

export interface Person {
  username: string
  name: string
  /** Their tweets in the list, in the list's order. */
  tweets: PortalTweet[]
}

/**
 * Groups tweets by author, most tweets first; ties keep the order of each
 * author's first tweet, and each author keeps their tweets' order.
 */
export function groupByPerson(tweets: PortalTweet[]): Person[] {
  const groups = new Map<string, PortalTweet[]>()
  for (const tweet of tweets) {
    groups.set(tweet.username, [...(groups.get(tweet.username) ?? []), tweet])
  }
  return Array.from(groups.entries())
    .map(([username, list]) => ({ username, name: list[0].name, tweets: list }))
    .sort((a, b) => b.tweets.length - a.tweets.length)
}

const tweetCount = (n: number) =>
  `${n.toLocaleString('en-US')} ${n === 1 ? 'tweet' : 'tweets'}`

/** Who, by name and handle, with how many of their tweets the list holds. */
function PersonLine({ person }: { person: Person }) {
  return (
    <>
      <TweetAvatar tweet={person.tweets[0]} size={28} />
      <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
        <span className="truncate font-medium text-foreground">
          {person.name || person.username}
        </span>
        <span className="truncate text-muted-foreground">
          @{person.username}
        </span>
      </span>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {tweetCount(person.tweets.length)}
      </span>
    </>
  )
}

/** A person whose tweets are folded behind their row. */
function PersonRow({
  person,
  citations,
}: {
  person: Person
  citations?: ReadonlyMap<string, number>
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
        <PersonLine person={person} />
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
            hideAuthor
          />
        </div>
      )}
    </li>
  )
}

/** Tweets an open person shows when the agent asked for all of them. */
const ALL_FIRST = 10

/** A person with their first tweets showing under their name. */
function PersonGroup({
  person,
  showcase,
  citations,
}: {
  person: Person
  showcase: number | 'all'
  citations?: ReadonlyMap<string, number>
}) {
  const count = person.tweets.length
  return (
    <li className="border-b border-border pb-2">
      <div className="flex min-h-[3rem] items-center gap-3 px-1 pt-2 text-sm">
        <PersonLine person={person} />
      </div>
      <div className="pl-10">
        <TweetRowList
          tweets={person.tweets}
          first={showcase === 'all' ? ALL_FIRST : showcase}
          step={count}
          label={`Tweets by @${person.username}`}
          citations={citations}
          moreLabel={(n) =>
            `${n.toLocaleString('en-US')} more by @${person.username}`
          }
          hideAuthor
        />
      </div>
    </li>
  )
}

/** People shown before a "more people" row. */
const FIRST_PEOPLE = 10

/**
 * The tweets grouped by author, most tweets first. With `showcase` 0 each
 * person is one row that opens to their tweets; otherwise each person shows
 * that many of their tweets (or all, folded past ten) under their name.
 */
export function PeopleList({
  tweets,
  label,
  citations,
  showcase = 0,
}: {
  tweets: PortalTweet[]
  label: string
  citations?: ReadonlyMap<string, number>
  showcase?: number | 'all'
}) {
  const people = useMemo(() => groupByPerson(tweets), [tweets])
  const [shown, setShown] = useState(FIRST_PEOPLE)
  const left = people.length - shown
  return (
    <ul aria-label={label} className="border-t border-border">
      {people
        .slice(0, shown)
        .map((person) =>
          showcase === 0 ? (
            <PersonRow
              key={person.username}
              person={person}
              citations={citations}
            />
          ) : (
            <PersonGroup
              key={person.username}
              person={person}
              showcase={showcase}
              citations={citations}
            />
          ),
        )}
      {left > 0 && (
        <li className="border-b border-border">
          <button
            type="button"
            onClick={() => setShown(people.length)}
            className={`${ROW_CLASS} text-muted-foreground hover:text-foreground`}
          >
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center">
              <Plus aria-hidden="true" className="h-4 w-4" />
            </span>
            {left.toLocaleString('en-US')} more{' '}
            {left === 1 ? 'person' : 'people'}
          </button>
        </li>
      )}
    </ul>
  )
}
