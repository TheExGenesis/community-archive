'use client'

import { useState } from 'react'
import type { PortalTweet } from '@/lib/portal/types'
import { CitationList } from './CitationRail'
import { EvidenceBoundary } from './EvidenceBoundary'
import type { Citation } from './messageView'
import { PeopleList, TweetRowList } from './TweetRows'

/** Rows shown before a "more" row; each press opens this many more. */
const FIRST_ROWS = 25
const MORE_ROWS = 50

type Tier = 'cited' | 'relevant' | 'other'
type Grouping = 'tweets' | 'people'

const count = (n: number) => n.toLocaleString('en-US')

const PILL =
  'inline-flex min-h-[2.25rem] items-center rounded-full px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/**
 * What the search found that the answer neither cites nor lists, by tier:
 * judged relevant, or other matches. Phones also get the cited tweets here,
 * since they have no rail. Each tier reads as tweets or grouped by person.
 */
export function Sources({
  title,
  relevant,
  relevantNotShown,
  otherMatches,
  citations,
}: {
  title: string
  relevant: PortalTweet[]
  /** Judged relevant but not returned to the page. */
  relevantNotShown: number
  otherMatches: PortalTweet[]
  citations: Citation[]
}) {
  const tiers: Array<{ id: Tier; label: string; phoneOnly?: boolean }> = []
  if (citations.length) {
    tiers.push({
      id: 'cited',
      label: `Cited (${count(citations.length)})`,
      phoneOnly: true,
    })
  }
  if (relevant.length || relevantNotShown) {
    tiers.push({
      id: 'relevant',
      label: `Relevant (${count(relevant.length + relevantNotShown)})`,
    })
  }
  if (otherMatches.length) {
    tiers.push({
      id: 'other',
      label: `Other matches (${count(otherMatches.length)})`,
    })
  }
  const fallback: Tier = tiers.find((tier) => !tier.phoneOnly)?.id ?? 'cited'
  const [chosen, setChosen] = useState<Tier | null>(null)
  const [grouping, setGrouping] = useState<Grouping>('tweets')
  if (!tiers.length) return null
  const tier = chosen && tiers.some((t) => t.id === chosen) ? chosen : fallback
  // Desktop never shows the phone-only Cited tier; it falls back there.
  const desktopTier = tier === 'cited' ? fallback : tier
  const tweetsFor = (id: Tier) =>
    id === 'relevant' ? relevant : id === 'other' ? otherMatches : []
  const citationNumbers = new Map(
    citations.map((citation) => [citation.id, citation.n]),
  )
  const onlyCited = tiers.every((t) => t.phoneOnly)

  const body = (id: Tier) => {
    if (id === 'cited') return <CitationList citations={citations} />
    const tweets = tweetsFor(id)
    const label = id === 'relevant' ? 'Relevant tweets' : 'Other matches'
    return (
      <div className="space-y-2">
        {grouping === 'people' ? (
          <PeopleList tweets={tweets} label={label} />
        ) : (
          <TweetRowList
            key={id}
            tweets={tweets}
            first={FIRST_ROWS}
            step={MORE_ROWS}
            label={label}
            citations={citationNumbers}
          />
        )}
        {id === 'relevant' && relevantNotShown > 0 && (
          <p className="text-sm text-muted-foreground">
            {count(relevantNotShown)} more were judged relevant but not
            returned.
          </p>
        )}
      </div>
    )
  }

  return (
    <section
      aria-label={title}
      className={`space-y-3 ${onlyCited ? 'lg:hidden' : ''}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        {tier !== 'cited' || !onlyCited ? (
          <div
            role="group"
            aria-label="Group sources"
            className="inline-flex rounded-md border border-border p-0.5 text-sm"
          >
            {(['tweets', 'people'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={grouping === value}
                onClick={() => setGrouping(value)}
                className={`min-h-[2rem] rounded px-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  grouping === value
                    ? 'bg-muted font-medium text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {value === 'tweets' ? 'Tweets' : 'People'}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {tiers.length > 1 && (
        <div role="group" aria-label="Which tweets" className="flex gap-1">
          {tiers.map((t) => {
            const selected = t.id === tier
            const selectedOnDesktop = t.id === desktopTier
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setChosen(t.id)}
                className={`${PILL} ${t.phoneOnly ? 'lg:hidden' : ''} ${
                  selected
                    ? 'bg-muted font-medium text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                } ${
                  !t.phoneOnly && selectedOnDesktop && !selected
                    ? 'lg:bg-muted lg:font-medium lg:text-foreground'
                    : ''
                }`}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      )}
      <EvidenceBoundary label="sources">
        {tier === 'cited' ? (
          <>
            <div className="lg:hidden">{body('cited')}</div>
            {desktopTier !== 'cited' && (
              <div className="hidden lg:block">{body(desktopTier)}</div>
            )}
          </>
        ) : (
          body(tier)
        )}
      </EvidenceBoundary>
    </section>
  )
}
