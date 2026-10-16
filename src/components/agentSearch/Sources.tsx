'use client'

import { useState } from 'react'
import type { PortalTweet } from '@/lib/portal/types'
import { EvidenceBoundary } from './EvidenceBoundary'
import { GroupingToggle, type Grouping } from './GroupingToggle'
import type { Citation } from './messageView'
import { PeopleList, TweetRowList } from './TweetRows'

/** Rows shown before a "more" row; each press opens this many more. */
const FIRST_ROWS = 25
const MORE_ROWS = 50

type Tier = 'relevant' | 'other'

const count = (n: number) => n.toLocaleString('en-US')

const PILL =
  'inline-flex min-h-[2.25rem] items-center rounded-full px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/**
 * What the search found that the answer neither cites nor lists, by tier:
 * judged relevant, or other matches. Each tier reads as tweets or grouped by
 * person; tweets the answer cites carry their number.
 */
export function Sources({
  title,
  titleClassName = '',
  relevant,
  relevantNotShown,
  otherMatches,
  citations,
}: {
  title: string
  titleClassName?: string
  relevant: PortalTweet[]
  /** Judged relevant but not returned to the page. */
  relevantNotShown: number
  otherMatches: PortalTweet[]
  citations: Citation[]
}) {
  const tiers: Array<{ id: Tier; label: string }> = []
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
  const [chosen, setChosen] = useState<Tier | null>(null)
  const [grouping, setGrouping] = useState<Grouping>('tweets')
  if (!tiers.length) return null
  const tier =
    chosen && tiers.some((t) => t.id === chosen) ? chosen : tiers[0].id
  const tweetsFor = (id: Tier) => (id === 'relevant' ? relevant : otherMatches)
  const citationNumbers = new Map(
    citations.map((citation) => [citation.id, citation.n]),
  )

  const body = (id: Tier) => {
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
    <section aria-label={title} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3
          className={`text-base font-semibold text-foreground ${titleClassName}`}
        >
          {title}
        </h3>
        <GroupingToggle
          value={grouping}
          onChange={setGrouping}
          label="Group sources"
        />
      </div>
      {tiers.length > 1 && (
        <div role="group" aria-label="Which tweets" className="flex gap-1">
          {tiers.map((t) => {
            const selected = t.id === tier
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setChosen(t.id)}
                className={`${PILL} ${
                  selected
                    ? 'bg-muted font-medium text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      )}
      <EvidenceBoundary label="sources">{body(tier)}</EvidenceBoundary>
    </section>
  )
}
