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
  const compact = variant === 'compact'
  if (loading && !conversations) {
    const rows = (
      <div
        role="status"
        aria-label="Loading your past questions"
        className={
          compact ? 'space-y-1 p-2' : 'divide-y divide-border border-y'
        }
      >
        {[72, 56, 64].map((width) => (
          <div
            key={width}
            className={`flex min-h-[2.75rem] items-center justify-between gap-4 ${compact ? 'px-1' : 'px-1 py-2.5'}`}
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
          className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground [font-family:inherit]"
        >
          Recent
        </h2>
        {rows}
      </section>
    )
  }
  if (!conversations?.length) return null
  const ALL = ':all'

  const list = (
    <ul
      className={
        compact ? 'divide-y divide-border' : 'divide-y divide-border border-y'
      }
    >
      {conversations.map((conversation) => {
        const current = conversation.id === currentId
        if (onDelete && confirming === conversation.id) {
          return (
            <li key={conversation.id}>
              <Confirm
                question="Delete this conversation?"
                action="Delete"
                onConfirm={() => onDelete(conversation.id)}
                onCancel={() => setConfirming(null)}
                compact={compact}
              />
            </li>
          )
        }
        return (
          <li key={conversation.id} className="group flex items-stretch">
            <button
              type="button"
              onClick={() => onOpen(conversation.id)}
              aria-current={current ? 'page' : undefined}
              className={`flex min-w-0 flex-1 items-baseline justify-between gap-4 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                compact
                  ? 'min-h-[2.75rem] rounded-md px-3 py-2.5'
                  : 'min-h-[2.75rem] px-1 py-2.5'
              } ${current ? 'bg-muted' : ''}`}
            >
              <span className="line-clamp-2 min-w-0 break-words text-sm text-foreground">
                {conversation.title}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {current ? 'Open now' : detail(conversation)}
              </span>
            </button>
            {/* Delete shows on the row's hover or keyboard focus, and
                always where nothing can hover. */}
            {onDelete && (
              <button
                type="button"
                onClick={() => setConfirming(conversation.id)}
                aria-label={`Delete “${conversation.title}”`}
                title="Delete"
                className="flex w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 opacity-0 transition hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring group-focus-within:opacity-100 group-hover:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100"
              >
                <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )

  const deleteAll =
    onDeleteAll &&
    (confirming === ALL ? (
      <Confirm
        question={`Delete all ${conversations.length === 1 ? 'history' : `${conversations.length} conversations`}? Today’s questions still count.`}
        action="Delete all"
        onConfirm={onDeleteAll}
        onCancel={() => setConfirming(null)}
        compact={compact}
      />
    ) : (
      <div className={compact ? 'px-3 py-2' : 'px-1 py-2'}>
        <button
          type="button"
          onClick={() => setConfirming(ALL)}
          className="rounded-sm text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Delete all history
        </button>
      </div>
    ))

  if (compact) {
    return (
      <>
        {list}
        {deleteAll}
      </>
    )
  }
  return (
    <section aria-labelledby="recent-conversations" className="mt-10">
      <h2
        id="recent-conversations"
        className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground [font-family:inherit]"
      >
        Recent
      </h2>
      {list}
      {deleteAll}
    </section>
  )
}
