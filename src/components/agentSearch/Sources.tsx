'use client'

import { useId, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { PortalTweet } from '@/lib/portal/types'
import {
  AvatarStack,
  EVIDENCE_PILL,
  EVIDENCE_PILL_CHEVRON,
} from './CitationRail'
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
  'inline-flex min-h-[2rem] items-center rounded-full px-3 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/**
 * What the search found that the answer neither cites nor lists, by tier:
 * judged relevant, or other matches. Collapsed by default behind a calm
 * disclosure bar so the answer stays uncluttered; expands in place to tiers
 * and tweet/people grouping.
 */
export function Sources({
  title,
  relevant,
  relevantNotShown,
  otherMatches,
  citations,
  open: controlledOpen,
  onOpenChange,
  defaultOpen = false,
}: {
  title: string
  relevant: PortalTweet[]
  /** Judged relevant but not returned to the page. */
  relevantNotShown: number
  otherMatches: PortalTweet[]
  citations: Citation[]
  /** Controlled open state (e.g. synced with the log line's "more found" button). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  defaultOpen?: boolean
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
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen)
  const open = controlledOpen ?? uncontrolledOpen
  const setOpen = (next: boolean) => {
    setUncontrolledOpen(next)
    onOpenChange?.(next)
  }
  const [chosen, setChosen] = useState<Tier | null>(null)
  const [grouping, setGrouping] = useState<Grouping>('tweets')
  const bodyId = useId()
  if (!tiers.length) return null
  const tier =
    chosen && tiers.some((t) => t.id === chosen) ? chosen : tiers[0].id
  const tweetsFor = (id: Tier) => (id === 'relevant' ? relevant : otherMatches)
  const citationNumbers = new Map(
    citations.map((citation) => [citation.id, citation.n]),
  )
  const totalCount = relevant.length + relevantNotShown + otherMatches.length
  const previewTweets = relevant.length ? relevant : otherMatches

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
          <p className="px-4 pb-3 text-xs text-muted-foreground">
            {count(relevantNotShown)} more were judged relevant but not
            returned.
          </p>
        )}
      </div>
    )
  }

  return (
    <section aria-label={title} className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={bodyId}
        className={EVIDENCE_PILL}
      >
        <AvatarStack tweets={previewTweets} />
        <span className="min-w-0 truncate">
          <span className="font-medium text-foreground">{title}</span>
          <span className="font-normal tabular-nums text-muted-foreground">
            {' '}
            · {count(totalCount)}
          </span>
        </span>
        <ChevronRight
          aria-hidden="true"
          className={`${EVIDENCE_PILL_CHEVRON} ${open ? 'rotate-90' : ''}`}
        />
      </button>
      {open && (
        <div id={bodyId} className="space-y-2 pt-1">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            {tiers.length > 1 ? (
              <div
                role="group"
                aria-label="Which tweets"
                className="flex gap-1"
              >
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
            ) : (
              <span className="text-xs font-medium text-muted-foreground">
                {tiers[0].label}
              </span>
            )}
            <GroupingToggle
              value={grouping}
              onChange={setGrouping}
              label="Group sources"
            />
          </div>
          <EvidenceBoundary label="sources">{body(tier)}</EvidenceBoundary>
        </div>
      )}
    </section>
  )
}
