'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import type { ConversationSummary } from '@/lib/agentSearch/history'

const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
})

function when(iso: string) {
  const date = new Date(iso)
  const today = new Date()
  return date.toDateString() === today.toDateString()
    ? date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : dateFormat.format(date)
}

function detail(conversation: ConversationSummary) {
  if (conversation.status === 'running') return 'Answering'
  return [
    conversation.turns > 1 ? `${conversation.turns} questions` : null,
    when(conversation.updatedAt),
  ]
    .filter(Boolean)
    .join(' · ')
}

/**
 * Deletes and reports what went wrong, or null when it worked. The page owns
 * the request; the list only asks and shows the outcome.
 */
export type DeleteHistory = () => Promise<string | null>

const QUIET_BUTTON =
  'rounded-md px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'

/**
 * A question asked before an irreversible step, in the row itself: what is
 * about to happen, then the step and a way back.
 */
function Confirm({
  question,
  action,
  onConfirm,
  onCancel,
  compact,
}: {
  question: string
  action: string
  onConfirm: DeleteHistory
  onCancel: () => void
  compact: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const confirm = async () => {
    setBusy(true)
    setError(null)
    const problem = await onConfirm()
    // On success the row goes away with the refreshed list.
    if (problem) {
      setError(problem)
      setBusy(false)
    }
  }
  return (
    <div
      role="group"
      aria-label={question}
      className={`flex min-h-[2.75rem] flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-sm ${compact ? 'px-3' : 'px-1'}`}
    >
      <span className="text-foreground">{error ?? question}</span>
      <span className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={confirm}
          disabled={busy}
          // The confirm is the next thing a keyboard user meets.
          autoFocus
          className={`${QUIET_BUTTON} text-destructive hover:bg-destructive/10`}
        >
          {busy ? 'Deleting…' : action}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className={`${QUIET_BUTTON} text-muted-foreground hover:bg-accent hover:text-foreground`}
        >
          Cancel
        </button>
      </span>
    </div>
  )
}

/**
 * The member's past conversations; opening one restores it in place. The
 * compact variant is the bare list, for the History popover and sheet. With
 * delete handlers, each row can be deleted, and so can all of them, after a
 * question in the row.
 */
/** Conversations shown on the start page before a quiet "Show all" toggle. */
const INITIAL_RECENT = 6

export function RecentConversations({
  conversations,
  onOpen,
  currentId,
  variant = 'section',
  onDelete,
  onDeleteAll,
  loading = false,
}: {
  conversations: ConversationSummary[] | null
  /** The list has not arrived yet: show its place, not an empty history. */
  loading?: boolean
  onOpen: (id: string) => void
  currentId?: string
  variant?: 'section' | 'compact'
  onDelete?: (id: string) => Promise<string | null>
  onDeleteAll?: DeleteHistory
}) {
  const [confirming, setConfirming] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const compact = variant === 'compact'
  if (loading && !conversations) {
    const rows = (
      <div
        role="status"
        aria-label="Loading your past questions"
        className={compact ? 'space-y-1 p-2' : '-mx-3 space-y-1'}
      >
        {[72, 56, 64].map((width) => (
          <div
            key={width}
            className={`flex min-h-[2.75rem] items-center justify-between gap-4 ${compact ? 'px-1' : 'px-3 py-2.5'}`}
          >
            <Skeleton className="h-4" style={{ width: `${width}%` }} />
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
      </div>
    )
    if (compact) return rows
    return (
      <section aria-labelledby="recent-conversations" className="mt-10">
        <h2
          id="recent-conversations"
          className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground [font-family:inherit]"
        >
          Recent
        </h2>
        {rows}
      </section>
    )
  }
  if (!conversations?.length) return null
  const ALL = ':all'
  const visible =
    compact || showAll ? conversations : conversations.slice(0, INITIAL_RECENT)
  const hiddenCount = conversations.length - visible.length

  const list = (
    <ul className={compact ? 'space-y-0.5' : '-mx-3 space-y-0.5'}>
      {visible.map((conversation) => {
        const current = conversation.id === currentId
        if (onDelete && confirming === conversation.id) {
          return (
            <li key={conversation.id} className={compact ? '' : 'px-2'}>
              <Confirm
                question="Delete this conversation? Its working logs expire within about 7 days."
                action="Delete"
                onConfirm={() => onDelete(conversation.id)}
                onCancel={() => setConfirming(null)}
                compact={compact}
              />
            </li>
          )
        }
        // The row is one borderless rounded band, delete included: the open
        // conversation is marked by it, the others light softly on hover.
        return (
          <li
            key={conversation.id}
            className={`group relative flex items-stretch transition-colors ${
              compact ? 'rounded-md' : 'rounded-lg'
            } ${current ? 'bg-muted' : 'hover:bg-muted/45'}`}
          >
            <button
              type="button"
              onClick={() => onOpen(conversation.id)}
              aria-current={current ? 'page' : undefined}
              className={`flex min-h-[2.75rem] min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                compact
                  ? 'flex-col justify-center gap-0.5 rounded-md py-2 pl-3 pr-1'
                  : 'items-baseline justify-between gap-4 rounded-lg px-3 py-2.5'
              }`}
            >
              <span className="line-clamp-2 min-w-0 break-words text-sm text-foreground">
                {conversation.title}
              </span>
              <span
                className={`shrink-0 text-xs tabular-nums text-muted-foreground/75 transition-opacity motion-reduce:transition-none ${
                  !compact && onDelete
                    ? '[@media(hover:hover)]:group-focus-within:opacity-0 [@media(hover:hover)]:group-hover:opacity-0'
                    : ''
                }`}
              >
                {detail(conversation)}
              </span>
            </button>
            {/* On the start page, Delete swaps in over the right-aligned
                timestamp on hover/focus so timestamps stay flush with the
                column edge at rest. On touch devices it stays inline. */}
            {onDelete && (
              <button
                type="button"
                onClick={() => setConfirming(conversation.id)}
                aria-label={`Delete “${conversation.title}”`}
                title="Delete"
                className={`flex shrink-0 items-center justify-center rounded-lg text-muted-foreground/60 opacity-0 transition hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring group-focus-within:opacity-100 group-hover:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100 ${
                  compact
                    ? 'w-9'
                    : 'h-8 w-8 [@media(hover:hover)]:absolute [@media(hover:hover)]:right-2 [@media(hover:hover)]:top-1/2 [@media(hover:hover)]:-translate-y-1/2 [@media(hover:none)]:my-auto [@media(hover:none)]:mr-1'
                }`}
              >
                <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )

  const showMoreToggle = !compact && conversations.length > INITIAL_RECENT && (
    <button
      type="button"
      onClick={() => setShowAll((value) => !value)}
      className="rounded-sm text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {showAll
        ? 'Show fewer'
        : `Show all ${conversations.length.toLocaleString('en-US')}`}
    </button>
  )

  const deleteAll =
    onDeleteAll &&
    (confirming === ALL ? (
      <Confirm
        question={`Delete all ${conversations.length === 1 ? 'history' : `${conversations.length} conversations`}? Today’s questions still count, and working logs expire within about 7 days.`}
        action="Delete all"
        onConfirm={onDeleteAll}
        onCancel={() => setConfirming(null)}
        compact={compact}
      />
    ) : compact ? (
      // In the popover and sheet: a row of its own under one rule, the
      // list's inset and height, quiet until pointed at.
      <div className="mt-1 border-t border-border pt-1">
        <button
          type="button"
          onClick={() => setConfirming(ALL)}
          className="flex min-h-[2.25rem] w-full items-center gap-2 rounded-md px-3 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
          Delete all history
        </button>
      </div>
    ) : (
      <button
        type="button"
        onClick={() => setConfirming(ALL)}
        className="rounded-sm text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Delete all history
      </button>
    ))

  if (compact) {
    return (
      <>
        {list}
        {deleteAll}
      </>
    )
  }
  const hasFooter = Boolean(showMoreToggle || deleteAll)
  return (
    <section aria-labelledby="recent-conversations" className="mt-9">
      <div className="mb-1.5 flex items-baseline justify-between gap-4">
        <h2
          id="recent-conversations"
          className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground [font-family:inherit]"
        >
          Recent
        </h2>
        {hiddenCount > 0 && (
          <span className="text-xs tabular-nums text-muted-foreground/70">
            {visible.length} of {conversations.length}
          </span>
        )}
      </div>
      {list}
      {hasFooter && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
          {confirming === ALL ? (
            <div className="w-full">{deleteAll}</div>
          ) : (
            <>
              <div className="flex items-center gap-4">
                {showMoreToggle}
                {deleteAll}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  )
}
